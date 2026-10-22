import { cookies, headers } from 'next/headers'
import { notFound, redirect } from 'next/navigation'
import { cache } from 'react'
import { isStaff } from '@/lib/status'
import type { SessionUser } from '@/lib/types'
import { env } from '../env'
import { createSessionRecord, deleteSession, findSessionUser, SESSION_COOKIE } from './session'

/** Usuario de la petición actual (memorizado durante el render). */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  return findSessionUser(token)
})

export async function startSession(userId: number) {
  const { token, expiresAt } = createSessionRecord(userId)
  ;(await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().APP_URL.startsWith('https://'),
    path: '/',
    expires: expiresAt,
  })
}

export async function endSession() {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (token) deleteSession(token)
  store.delete(SESSION_COOKIE)
}

export async function currentSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value
}

/** Valida que la ruta de retorno sea interna para evitar redirecciones abiertas. */
export function safeNextPath(value: unknown, fallback = '/cuenta'): string {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}

export async function requireUser(nextPath?: string): Promise<SessionUser> {
  const user = await getCurrentUser()
  if (!user) {
    redirect(nextPath ? `/entrar?siguiente=${encodeURIComponent(nextPath)}` : '/entrar')
  }
  return user
}

/** Personal de biblioteca (bibliotecario o administrador). A los demás, el panel no existe. */
export async function requireStaff(nextPath = '/admin'): Promise<SessionUser> {
  const user = await requireUser(nextPath)
  if (!isStaff(user.role)) notFound()
  return user
}

export async function requireAdmin(nextPath = '/admin'): Promise<SessionUser> {
  const user = await requireStaff(nextPath)
  if (user.role !== 'admin') notFound()
  return user
}

/** IP del cliente para el limitador de intentos (solo si hay un proxy de confianza delante). */
export async function clientKey(): Promise<string> {
  if (!env().TRUST_PROXY) return 'local'
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'unknown'
}
