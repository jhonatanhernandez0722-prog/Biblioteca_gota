'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { formatDate } from '@/lib/dates'
import { describeLate, formatCOP } from '@/lib/fines'
import type { ActionState, CopyCondition, CopyStatus, Role, UserStatus } from '@/lib/types'
import { requireAdmin, requireStaff } from '@/server/auth/current-user'
import {
  createBook,
  deleteBook,
  findPossibleDuplicates,
  getBookById,
  setBookCover,
  setBookStatus,
  updateBook,
  updateCopyDetails,
  type BookInput,
} from '@/server/catalog'
import {
  addCopies,
  approveLoan,
  cancelLoan,
  cancelReservation,
  checkoutLoan,
  rejectLoan,
  returnLoan,
  setCopyStatus,
  settleFine,
} from '@/server/circulation'
import { fetchRemoteCover, isAllowedCoverUrl, MAX_COVER_BYTES, removeCover, storeCover } from '@/server/covers'
import { isDomainError } from '@/server/errors'
import { setFlash } from '@/server/flash'
import { invalidateSearchCache } from '@/server/search-cache'
import { setUserRole, setUserStatus } from '@/server/users'

const id = z.coerce.number().int().positive()
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Usa como máximo ${max} caracteres.`)
    .optional()
    .transform((v) => (v ? v : undefined))
const optionalInt = (min: number, max: number, message: string) =>
  z
    .union([z.literal(''), z.coerce.number().int(message).min(min, message).max(max, message)])
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v))

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {}
  for (const issue of error.issues) result[String(issue.path[0] ?? 'form')] ??= issue.message
  return result
}

/** Ejecuta una operación del panel y traduce los errores de negocio a un mensaje. */
async function attempt(fn: () => string | Promise<string>, paths: string[]): Promise<ActionState> {
  try {
    const message = await fn()
    for (const path of paths) revalidatePath(path)
    invalidateSearchCache()
    return { ok: true, message }
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message, fieldErrors: error.fieldErrors }
    throw error
  }
}

/* ───────────────────────── Fichas de libros ───────────────────────── */

const bookSchema = z.object({
  bookId: id.optional(),
  title: z.string().trim().min(1, 'El título es obligatorio.').max(300, 'Usa como máximo 300 caracteres.'),
  subtitle: optionalText(300),
  authors: z
    .string()
    .max(1200)
    .transform((v) =>
      v
        .split(/\n|;/)
        .map((a) => a.trim())
        .filter(Boolean),
    )
    .refine((list) => list.length >= 1, 'Indica al menos un autor o autora (o «Anónimo»).')
    .refine((list) => list.length <= 10 && list.every((a) => a.length <= 120), 'Revisa la lista de autores.'),
  isbn: optionalText(20),
  publisher: optionalText(200),
  publishedYear: optionalInt(1000, new Date().getFullYear() + 1, 'Escribe un año válido, por ejemplo 1967.'),
  pageCount: optionalInt(1, 20000, 'Escribe un número de páginas válido.'),
  language: optionalText(5),
  callNumber: optionalText(40),
  keywords: optionalText(500),
  description: optionalText(8000),
  newCategories: optionalText(300),
  featured: z.literal('on').optional(),
  editorialPick: z.literal('on').optional(),
  editorialNote: optionalText(1000),
  editorialQuote: optionalText(600),
  sourceProvider: z.enum(['manual', 'openlibrary', 'googlebooks']).default('manual'),
  sourceRef: optionalText(100),
  sourceUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v && /^https:\/\//.test(v) ? v : undefined)),
  coverMode: z.enum(['keep', 'provider', 'upload', 'none']).default('none'),
  coverUrl: optionalText(500),
  copies: optionalInt(0, 50, 'Entre 0 y 50 ejemplares.'),
  location: optionalText(100),
  confirmDuplicate: z.literal('on').optional(),
})

async function resolveCover(
  mode: z.infer<typeof bookSchema>['coverMode'],
  coverUrl: string | undefined,
  file: FormDataEntryValue | null,
): Promise<{ key: string; color: string } | null> {
  if (mode === 'upload') {
    if (!(file instanceof File) || file.size === 0) {
      throw Object.assign(new Error('missing'), { field: 'coverFile', message: 'Elige una imagen para la portada.' })
    }
    if (file.size > MAX_COVER_BYTES) {
      throw Object.assign(new Error('large'), { field: 'coverFile', message: 'La imagen pesa más de 5 MB.' })
    }
    return await storeCover(Buffer.from(await file.arrayBuffer()))
  }
  if (mode === 'provider') {
    if (!coverUrl || !isAllowedCoverUrl(coverUrl)) {
      throw Object.assign(new Error('url'), {
        field: 'coverMode',
        message: 'El proveedor no ofrece portada para este libro. Sube una imagen o guárdalo sin portada.',
      })
    }
    return await storeCover(await fetchRemoteCover(coverUrl), { rejectFlat: true })
  }
  return null
}

export async function saveBookAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const raw = Object.fromEntries(formData)
  delete raw.coverFile
  const parsed = bookSchema.safeParse(raw)
  if (!parsed.success) {
    return { ok: false, message: 'Revisa los campos marcados.', fieldErrors: fieldErrors(parsed.error) }
  }
  const data = parsed.data
  const categories = [
    ...formData.getAll('categories').map(String),
    ...(data.newCategories ?? '').split(','),
  ]
    .map((c) => c.trim())
    .filter((c) => c && c.length <= 60)
    .slice(0, 8)

  // Duplicados: el ISBN bloquea; un título y autor muy parecidos piden confirmación.
  const duplicates = await findPossibleDuplicates({
    isbn: data.isbn,
    title: data.title,
    authors: data.authors,
    excludeId: data.bookId,
  })
  if (duplicates.exact.length) {
    const match = duplicates.exact[0]!
    return {
      ok: false,
      message: `El ISBN ya pertenece a «${match.title}». Abre esa ficha y añade ejemplares en lugar de duplicarla.`,
      fieldErrors: { isbn: 'Este ISBN ya está en el catálogo.' },
    }
  }
  if (duplicates.similar.length && !data.confirmDuplicate) {
    return {
      ok: false,
      message: `Hay ${duplicates.similar.length === 1 ? 'un libro muy parecido' : 'libros muy parecidos'} en el catálogo. Revísalos y, si es otro libro u otra edición, confírmalo para guardar.`,
      fieldErrors: { confirmDuplicate: 'Confirma que no es un duplicado.' },
    }
  }

  let cover: { key: string; color: string } | null = null
  try {
    cover = await resolveCover(data.coverMode, data.coverUrl, formData.get('coverFile'))
  } catch (error) {
    if (isDomainError(error)) {
      return { ok: false, message: error.message, fieldErrors: { [data.coverMode === 'upload' ? 'coverFile' : 'coverMode']: error.message } }
    }
    const custom = error as { field?: string; message?: string }
    if (custom.field) return { ok: false, message: custom.message, fieldErrors: { [custom.field]: custom.message! } }
    throw error
  }

  const input: BookInput = {
    title: data.title,
    subtitle: data.subtitle,
    authors: data.authors,
    description: data.description,
    publisher: data.publisher,
    publishedYear: data.publishedYear,
    isbn: data.isbn,
    language: data.language,
    pageCount: data.pageCount,
    callNumber: data.callNumber,
    keywords: data.keywords,
    categories,
    featured: Boolean(data.featured),
    editorialPick: Boolean(data.editorialPick),
    editorialNote: data.editorialNote,
    editorialQuote: data.editorialQuote,
    sourceProvider: data.sourceProvider,
    sourceRef: data.sourceRef,
    sourceUrl: data.sourceUrl,
  }

  let saved: { id: number; slug: string }
  try {
    if (data.bookId) {
      saved = await updateBook(data.bookId, input, staff.id)
    } else {
      saved = await createBook(input, staff.id)
      if (data.copies && data.copies > 0) {
        await addCopies(staff.id, saved.id, data.copies, { location: data.location })
      }
    }
    if (cover) {
      const { previousKey } = await setBookCover(saved.id, cover.key, cover.color, staff.id)
      if (previousKey && previousKey !== cover.key) await removeCover(previousKey)
    } else if (data.coverMode === 'none' && data.bookId) {
      const { previousKey } = await setBookCover(saved.id, null, null, staff.id)
      await removeCover(previousKey)
    }
  } catch (error) {
    if (cover) await removeCover(cover.key)
    if (isDomainError(error)) return { ok: false, message: error.message, fieldErrors: error.fieldErrors }
    throw error
  }

  revalidatePath('/admin/libros')
  revalidatePath(`/libros/${saved.slug}`)
  revalidatePath('/')
  invalidateSearchCache()
  await setFlash(data.bookId ? 'Cambios guardados.' : `«${data.title}» ya está en el catálogo.`)
  redirect(`/admin/libros/${saved.id}`)
}

export async function setBookStatusAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const parsed = z.object({ bookId: id, status: z.enum(['active', 'archived']) }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Datos no válidos.' }
  const book = await getBookById(parsed.data.bookId)
  return attempt(
    async () => {
      await setBookStatus(parsed.data.bookId, parsed.data.status, staff.id)
      return parsed.data.status === 'archived'
        ? 'Libro archivado: ya no aparece en el catálogo público.'
        : 'Libro recuperado: vuelve a aparecer en el catálogo.'
    },
    ['/admin/libros', `/admin/libros/${parsed.data.bookId}`, book ? `/libros/${book.slug}` : '/', '/'],
  )
}

export async function deleteBookAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const parsed = z.object({ bookId: id }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Datos no válidos.' }
  const book = await getBookById(parsed.data.bookId)
  try {
    const { coverKey } = await deleteBook(parsed.data.bookId, staff.id)
    await removeCover(coverKey)
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message }
    throw error
  }
  revalidatePath('/admin/libros')
  revalidatePath('/')
  invalidateSearchCache()
  await setFlash(`Se eliminó la ficha de «${book?.title ?? 'el libro'}».`)
  redirect('/admin/libros')
}

/* ───────────────────────── Ejemplares ───────────────────────── */

const conditions = ['new', 'good', 'worn', 'damaged'] as const satisfies readonly CopyCondition[]

export async function addCopiesAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const parsed = z
    .object({
      bookId: id,
      count: z.coerce.number().int('Indica un número entero.').min(1, 'Al menos 1.').max(50, 'Como máximo 50.'),
      location: optionalText(100),
      condition: z.enum(conditions).default('new'),
    })
    .safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Revisa los datos.', fieldErrors: fieldErrors(parsed.error) }
  const { bookId, count, location, condition } = parsed.data
  const book = await getBookById(bookId)
  return attempt(
    async () => {
      await addCopies(staff.id, bookId, count, { location, condition })
      return count === 1 ? 'Ejemplar registrado.' : `${count} ejemplares registrados.`
    },
    [`/admin/libros/${bookId}`, book ? `/libros/${book.slug}` : '/', '/admin/libros', '/'],
  )
}

export async function updateCopyAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const parsed = z
    .object({
      copyId: id,
      bookId: id,
      location: optionalText(100),
      condition: z.enum(conditions),
      notes: optionalText(300),
    })
    .safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Revisa los datos.', fieldErrors: fieldErrors(parsed.error) }
  return attempt(
    async () => {
      await updateCopyDetails(parsed.data.copyId, parsed.data, staff.id)
      return 'Ejemplar actualizado.'
    },
    [`/admin/libros/${parsed.data.bookId}`],
  )
}

export async function setCopyStatusAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const parsed = z
    .object({
      copyId: id,
      bookId: id,
      status: z.enum(['available', 'maintenance', 'lost', 'withdrawn'] satisfies CopyStatus[]),
    })
    .safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Datos no válidos.' }
  const book = await getBookById(parsed.data.bookId)
  const labels: Record<string, string> = {
    available: 'vuelve a la estantería',
    maintenance: 'pasa a reparación',
    lost: 'queda marcado como extraviado',
    withdrawn: 'queda retirado de la colección',
  }
  return attempt(
    async () => {
      await setCopyStatus(staff.id, parsed.data.copyId, parsed.data.status)
      return `El ejemplar ${labels[parsed.data.status]}.`
    },
    [`/admin/libros/${parsed.data.bookId}`, book ? `/libros/${book.slug}` : '/', '/'],
  )
}

/* ───────────────────────── Circulación ───────────────────────── */

const loanForm = z.object({ loanId: id })
const LOAN_PATHS = ['/admin', '/admin/prestamos', '/cuenta', '/']

export async function approveLoanAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const parsed = loanForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Solicitud no válida.' }
  return attempt(async () => {
    await approveLoan(staff.id, parsed.data.loanId)
    return 'Solicitud aprobada: el ejemplar queda apartado y avisamos al lector.'
  }, LOAN_PATHS)
}

export async function rejectLoanAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const parsed = loanForm.extend({ reason: z.string().max(300) }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Solicitud no válida.' }
  return attempt(async () => {
    await rejectLoan(staff.id, parsed.data.loanId, parsed.data.reason)
    return 'Solicitud rechazada. El lector verá el motivo.'
  }, LOAN_PATHS)
}

export async function checkoutLoanAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const parsed = loanForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Solicitud no válida.' }
  return attempt(async () => {
    const { dueAt } = await checkoutLoan(staff.id, parsed.data.loanId)
    return `Entregado. Fecha de devolución: ${formatDate(dueAt)}.`
  }, LOAN_PATHS)
}

export async function returnLoanAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const parsed = loanForm
    .extend({ toMaintenance: z.literal('on').optional() })
    .safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Préstamo no válido.' }
  return attempt(async () => {
    const { fine } = await returnLoan(staff.id, parsed.data.loanId, { toMaintenance: Boolean(parsed.data.toMaintenance) })
    const base = parsed.data.toMaintenance
      ? 'Devolución registrada. El ejemplar pasa a reparación.'
      : 'Devolución registrada. Si había lista de espera, el ejemplar ya está apartado para la siguiente persona.'
    return fine
      ? `${base} Llegó con ${describeLate(fine.days)}: se generó una multa de ${formatCOP(fine.amount)}.`
      : base
  }, LOAN_PATHS)
}

const fineForm = z.object({ fineId: id, reason: z.string().max(300).optional() })

export async function payFineAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const parsed = fineForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Multa no válida.' }
  return attempt(async () => {
    await settleFine(staff.id, parsed.data.fineId, 'paid', parsed.data.reason)
    return 'Pago registrado. Si no tiene otras deudas, el lector ya puede volver a pedir libros.'
  }, LOAN_PATHS)
}

export async function waiveFineAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const parsed = fineForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Multa no válida.' }
  return attempt(async () => {
    await settleFine(staff.id, parsed.data.fineId, 'waived', parsed.data.reason)
    return 'Multa condonada. El motivo queda en el registro de actividad.'
  }, LOAN_PATHS)
}

export async function staffCancelLoanAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const parsed = loanForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Solicitud no válida.' }
  return attempt(async () => {
    await cancelLoan({ id: staff.id, isStaff: true }, parsed.data.loanId)
    return 'Apartado anulado. El ejemplar pasa a la siguiente persona o a la estantería.'
  }, LOAN_PATHS)
}

export async function staffCancelReservationAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const parsed = z.object({ reservationId: id }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Reserva no válida.' }
  return attempt(async () => {
    await cancelReservation({ id: staff.id, isStaff: true }, parsed.data.reservationId)
    return 'Reserva cancelada.'
  }, LOAN_PATHS)
}

/* ───────────────────────── Usuarios ───────────────────────── */

export async function setUserRoleAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin()
  const parsed = z
    .object({ userId: id, role: z.enum(['reader', 'librarian', 'admin'] satisfies Role[]) })
    .safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Datos no válidos.' }
  return attempt(async () => {
    await setUserRole(admin.id, parsed.data.userId, parsed.data.role)
    return 'Rol actualizado. La persona tendrá que volver a entrar.'
  }, ['/admin/usuarios', `/admin/usuarios/${parsed.data.userId}`])
}

export async function setUserStatusAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const staff = await requireStaff()
  const parsed = z
    .object({ userId: id, status: z.enum(['active', 'suspended'] satisfies UserStatus[]) })
    .safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Datos no válidos.' }
  return attempt(async () => {
    await setUserStatus(staff, parsed.data.userId, parsed.data.status)
    return parsed.data.status === 'suspended'
      ? 'Cuenta suspendida: no podrá pedir ni reservar libros.'
      : 'Cuenta reactivada.'
  }, ['/admin/usuarios', `/admin/usuarios/${parsed.data.userId}`])
}
