'use server'

import { randomUUID } from 'node:crypto'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { isStaff } from '@/lib/status'
import type { ActionState } from '@/lib/types'
import { clientKey, endSession, safeNextPath, startSession } from '@/server/auth/current-user'
import { rateLimit, resetRateLimit } from '@/server/auth/rate-limit'
import { isDomainError } from '@/server/errors'
import { setFlash } from '@/server/flash'
import { authenticate, registerUser, requestPasswordReset, resetPassword } from '@/server/users'

const email = z.string().trim().min(1, 'Escribe tu correo.').email('Revisa el correo: falta algo (por ejemplo, la @).').max(160)
const newPassword = z
  .string()
  .min(10, 'Usa al menos 10 caracteres.')
  .max(128, 'Usa como máximo 128 caracteres.')

function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    result[key] ??= issue.message
  }
  return result
}

/** Se comprueba aparte para mostrarlo junto a los demás errores (zod no ejecuta las reglas de objeto si hay errores de campo). */
function checkConfirmation(formData: FormData, errors: Record<string, string>) {
  if (String(formData.get('password') ?? '') !== String(formData.get('confirm') ?? '')) {
    errors.confirm ??= 'Las contraseñas no coinciden.'
  }
  return errors
}

function waitMessage(seconds: number) {
  const minutes = Math.ceil(seconds / 60)
  return `Demasiados intentos. Espera ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'} y vuelve a probar.`
}

/* ───────────── Entrar ───────────── */

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Escribe tu contraseña.').max(128),
  siguiente: z.string().optional(),
})

export async function loginAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const values = { email: String(formData.get('email') ?? '').slice(0, 160) }
  const parsed = loginSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: 'Revisa los campos marcados.', fieldErrors: fieldErrors(parsed.error), values }
  }
  const key = `login:${await clientKey()}:${parsed.data.email.toLowerCase()}`
  const limit = rateLimit(key, 8, 15 * 60_000)
  if (!limit.ok) return { ok: false, message: waitMessage(limit.retryAfterSeconds), values }

  let user
  try {
    user = await authenticate(parsed.data.email, parsed.data.password)
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message, values }
    throw error
  }
  if (!user) {
    return { ok: false, message: 'El correo o la contraseña no coinciden. Revísalos o recupera tu contraseña.', values }
  }
  resetRateLimit(key)
  await startSession(user.id)
  await setFlash(`Hola, ${user.name.split(' ')[0]}. Ya puedes pedir libros.`)
  redirect(safeNextPath(parsed.data.siguiente, isStaff(user.role) ? '/admin' : '/cuenta'))
}

/* ───────────── Crear cuenta ───────────── */

const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Escribe tu nombre.').max(80, 'Usa como máximo 80 caracteres.'),
    email,
    password: newPassword,
    confirm: z.string(),
    acceptTerms: z.literal('on', {
      message: 'Sin aceptar los términos no podemos crear tu cuenta: definen cómo funciona el préstamo. Puedes consultar el catálogo sin cuenta.',
    }),
    acceptPrivacy: z.literal('on', {
      message: 'Sin tu autorización no podemos tratar tu nombre y correo, y sin ellos no es posible gestionar préstamos. Puedes consultar el catálogo sin cuenta.',
    }),
    siguiente: z.string().optional(),
  })

export async function registerAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const values = {
    name: String(formData.get('name') ?? '').slice(0, 80),
    email: String(formData.get('email') ?? '').slice(0, 160),
  }
  const parsed = registerSchema.safeParse(Object.fromEntries(formData))
  const errors = checkConfirmation(formData, parsed.success ? {} : fieldErrors(parsed.error))
  if (!parsed.success || Object.keys(errors).length) {
    return { ok: false, message: 'Revisa los campos marcados.', fieldErrors: errors, values }
  }
  const limit = rateLimit(`register:${await clientKey()}`, 6, 60 * 60_000)
  if (!limit.ok) return { ok: false, message: waitMessage(limit.retryAfterSeconds), values }

  let user
  try {
    user = await registerUser({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
      consents: { source: 'formulario:registro', requestId: randomUUID() },
    })
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message, fieldErrors: error.fieldErrors, values }
    throw error
  }
  await startSession(user.id)
  await setFlash(`Te damos la bienvenida, ${user.name.split(' ')[0]}. Tu carné es el ${user.cardNumber}.`)
  redirect(safeNextPath(parsed.data.siguiente, '/cuenta'))
}

/* ───────────── Salir ───────────── */

export async function logoutAction() {
  await endSession()
  await setFlash('Cerraste la sesión.', 'info')
  redirect('/')
}

/* ───────────── Recuperar contraseña ───────────── */

export async function forgotPasswordAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const values = { email: String(formData.get('email') ?? '').slice(0, 160) }
  const parsed = z.object({ email }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, message: 'Revisa el correo.', fieldErrors: fieldErrors(parsed.error), values }
  }
  const limit = rateLimit(`forgot:${await clientKey()}:${parsed.data.email.toLowerCase()}`, 4, 60 * 60_000)
  if (!limit.ok) return { ok: false, message: waitMessage(limit.retryAfterSeconds) }
  await requestPasswordReset(parsed.data.email)
  return {
    ok: true,
    message:
      'Si hay una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva. Caduca en una hora.',
  }
}

const resetSchema = z.object({ token: z.string().min(20).max(200), password: newPassword, confirm: z.string() })

export async function resetPasswordAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData))
  const errors = checkConfirmation(formData, parsed.success ? {} : fieldErrors(parsed.error))
  if (!parsed.success || Object.keys(errors).length) {
    return { ok: false, message: 'Revisa los campos marcados.', fieldErrors: errors }
  }
  try {
    await resetPassword(parsed.data.token, parsed.data.password)
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message }
    throw error
  }
  await setFlash('Contraseña actualizada. Entra con la nueva.')
  redirect('/entrar')
}
