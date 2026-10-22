'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { ActionState } from '@/lib/types'
import { currentSessionToken, requireUser } from '@/server/auth/current-user'
import {
  cancelLoan,
  cancelReservation,
  requestLoan,
  reserveBook,
  type LoanRequestOptions,
} from '@/server/circulation'
import { isDomainError } from '@/server/errors'
import { invalidateSearchCache } from '@/server/search-cache'
import { addLoanCard, changePassword, removeLoanCard, updateIdentity, updateProfileName } from '@/server/users'

const id = z.coerce.number().int().positive()

function refresh(slug?: string) {
  revalidatePath('/cuenta')
  revalidatePath('/')
  if (slug) revalidatePath(`/libros/${slug}`)
  invalidateSearchCache()
}

async function run(fn: () => Promise<string>, slug?: string): Promise<ActionState> {
  try {
    const message = await fn()
    refresh(slug)
    return { ok: true, message }
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message, fieldErrors: error.fieldErrors }
    throw error
  }
}

/**
 * Formulario de solicitud o reserva: plazo de lectura, carné (uno guardado o uno escrito)
 * y la confirmación expresa de que el plazo no se podrá cambiar.
 */
const borrowForm = z.object({
  bookId: id,
  slug: z.string().max(120).optional(),
  loanDays: z.coerce.number().int().positive().optional(),
  card: z.string().max(40).optional(),
  cardNumber: z.string().max(40).optional(),
  confirmTerm: z.literal('on').optional(),
})

function borrowOptions(data: z.infer<typeof borrowForm>): LoanRequestOptions | ActionState {
  if (!data.confirmTerm) {
    return {
      ok: false,
      message: 'Confirma que entiendes que el plazo de lectura no se podrá cambiar.',
      fieldErrors: { confirmTerm: 'Marca la casilla para confirmar.' },
    }
  }
  if (data.card === 'new') {
    if (!data.cardNumber?.trim()) {
      return { ok: false, message: 'Escribe el número del carné.', fieldErrors: { cardNumber: 'Escribe el número del carné.' } }
    }
    return { loanDays: data.loanDays, cardNumber: data.cardNumber }
  }
  const cardId = data.card ? Number(data.card) : undefined
  return { loanDays: data.loanDays, cardId: Number.isInteger(cardId) && cardId! > 0 ? cardId : undefined }
}

export async function requestLoanAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const parsed = borrowForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'No se pudo identificar el libro.' }
  const user = await requireUser(parsed.data.slug ? `/libros/${parsed.data.slug}` : undefined)
  const options = borrowOptions(parsed.data)
  if ('ok' in options) return options
  return await run(async () => {
    const { loanDays, cardNumber } = await requestLoan(user.id, parsed.data.bookId, options)
    return `Solicitud enviada por ${loanDays} días${cardNumber ? ` con el carné ${cardNumber}` : ''}. Te avisaremos cuando el libro esté listo para recoger.`
  }, parsed.data.slug)
}

export async function reserveAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const parsed = borrowForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'No se pudo identificar el libro.' }
  const user = await requireUser(parsed.data.slug ? `/libros/${parsed.data.slug}` : undefined)
  const options = borrowOptions(parsed.data)
  if ('ok' in options) return options
  return await run(async () => {
    const { position } = await reserveBook(user.id, parsed.data.bookId, options)
    return position === 1
      ? 'Reserva hecha. Eres la siguiente persona en la lista: te avisaremos cuando vuelva un ejemplar.'
      : `Reserva hecha. Estás en el puesto ${position} de la lista de espera.`
  }, parsed.data.slug)
}

const loanForm = z.object({ loanId: id, slug: z.string().max(120).optional() })

export async function cancelLoanAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const parsed = loanForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'No se pudo identificar la solicitud.' }
  const user = await requireUser('/cuenta')
  return await run(async () => {
    await cancelLoan({ id: user.id, isStaff: false }, parsed.data.loanId)
    return 'Solicitud cancelada.'
  }, parsed.data.slug)
}

const reservationForm = z.object({ reservationId: id, slug: z.string().max(120).optional() })

export async function cancelReservationAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const parsed = reservationForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'No se pudo identificar la reserva.' }
  const user = await requireUser('/cuenta')
  return await run(async () => {
    await cancelReservation({ id: user.id, isStaff: false }, parsed.data.reservationId)
    return 'Saliste de la lista de espera.'
  }, parsed.data.slug)
}

/* ───────────── Perfil ───────────── */

export async function updateProfileAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const user = await requireUser('/cuenta/perfil')
  const parsed = z
    .object({ name: z.string().trim().min(2, 'Escribe tu nombre.').max(80, 'Usa como máximo 80 caracteres.') })
    .safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: 'Revisa el nombre.', fieldErrors: { name: parsed.error.issues[0]!.message } }
  }
  await updateProfileName(user.id, parsed.data.name)
  revalidatePath('/cuenta', 'layout')
  return { ok: true, message: 'Perfil actualizado.' }
}

/* ───────────── Datos para préstamos y carnés ───────────── */

export async function updateIdentityAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const user = await requireUser('/cuenta/perfil')
  const field = (name: string) => String(formData.get(name) ?? '').slice(0, 40)
  // Se devuelven para no vaciar el formulario tras un error. La tarjeta nunca.
  const values = { phone: field('phone'), documentType: field('documentType'), documentNumber: field('documentNumber') }
  try {
    await updateIdentity(user.id, { ...values, creditCard: field('creditCard') })
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message, fieldErrors: error.fieldErrors, values }
    throw error
  }
  revalidatePath('/cuenta', 'layout')
  return { ok: true, message: 'Datos guardados. Ya puedes pedir libros.' }
}

export async function addLoanCardAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const user = await requireUser('/cuenta/perfil')
  const cardNumber = String(formData.get('cardNumber') ?? '').slice(0, 40)
  const label = String(formData.get('label') ?? '').slice(0, 60)
  try {
    const card = await addLoanCard(user.id, cardNumber, label)
    revalidatePath('/cuenta', 'layout')
    return { ok: true, message: `Carné ${card.number} guardado.` }
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message, fieldErrors: error.fieldErrors, values: { cardNumber, label } }
    throw error
  }
}

export async function removeLoanCardAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const user = await requireUser('/cuenta/perfil')
  const parsed = z.object({ cardId: id }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'No se pudo identificar el carné.' }
  try {
    await removeLoanCard(user.id, parsed.data.cardId)
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message }
    throw error
  }
  revalidatePath('/cuenta', 'layout')
  return { ok: true, message: 'Carné eliminado de tu cuenta.' }
}

export async function changePasswordAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const user = await requireUser('/cuenta/perfil')
  const parsed = z
    .object({
      currentPassword: z.string().min(1, 'Escribe tu contraseña actual.'),
      password: z.string().min(10, 'Usa al menos 10 caracteres.').max(128),
      confirm: z.string(),
    })
    .safeParse(Object.fromEntries(formData))
  const fieldErrors: Record<string, string> = {}
  if (!parsed.success) {
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message
  }
  if (String(formData.get('password') ?? '') !== String(formData.get('confirm') ?? '')) {
    fieldErrors.confirm ??= 'Las contraseñas no coinciden.'
  }
  if (!parsed.success || Object.keys(fieldErrors).length) {
    return { ok: false, message: 'Revisa los campos marcados.', fieldErrors }
  }
  try {
    await changePassword(user.id, parsed.data.currentPassword, parsed.data.password, await currentSessionToken())
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message, fieldErrors: error.fieldErrors }
    throw error
  }
  return { ok: true, message: 'Contraseña cambiada. Cerramos tus otras sesiones abiertas.' }
}
