'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { formatDate } from '@/lib/dates'
import type { ActionState } from '@/lib/types'
import { currentSessionToken, requireUser } from '@/server/auth/current-user'
import {
  cancelLoan,
  cancelReservation,
  renewLoan,
  requestLoan,
  reserveBook,
} from '@/server/circulation'
import { isDomainError } from '@/server/errors'
import { changePassword, updateProfileName } from '@/server/users'

const id = z.coerce.number().int().positive()

function refresh(slug?: string) {
  revalidatePath('/cuenta')
  revalidatePath('/')
  if (slug) revalidatePath(`/libros/${slug}`)
}

async function run(fn: () => Promise<string>, slug?: string): Promise<ActionState> {
  try {
    const message = await fn()
    refresh(slug)
    return { ok: true, message }
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message }
    throw error
  }
}

const bookForm = z.object({ bookId: id, slug: z.string().max(120).optional() })

export async function requestLoanAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const parsed = bookForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'No se pudo identificar el libro.' }
  const user = await requireUser(parsed.data.slug ? `/libros/${parsed.data.slug}` : undefined)
  return await run(async () => {
    await requestLoan(user.id, parsed.data.bookId)
    return 'Solicitud enviada. Te avisaremos cuando el libro esté listo para recoger.'
  }, parsed.data.slug)
}

export async function reserveAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const parsed = bookForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'No se pudo identificar el libro.' }
  const user = await requireUser(parsed.data.slug ? `/libros/${parsed.data.slug}` : undefined)
  return await run(async () => {
    const { position } = await reserveBook(user.id, parsed.data.bookId)
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

export async function renewLoanAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const parsed = loanForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'No se pudo identificar el préstamo.' }
  const user = await requireUser('/cuenta')
  return await run(async () => {
    const { dueAt } = await renewLoan({ id: user.id, isStaff: false }, parsed.data.loanId)
    return `Préstamo renovado. Nueva fecha de devolución: ${formatDate(dueAt)}.`
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
