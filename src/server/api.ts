import { isStaff } from '@/lib/status'
import type { SessionUser } from '@/lib/types'
import { getCurrentUser } from './auth/current-user'
import { rateLimit } from './auth/rate-limit'
import { PROVIDER_ERROR_MESSAGE, ProviderError } from './integrations/metadata'

/** Utilidades de las rutas JSON del panel: autorización en el servidor y errores uniformes. */
export function json(data: unknown, init: ResponseInit = {}) {
  return Response.json(data, {
    ...init,
    headers: { 'Cache-Control': 'no-store', ...(init.headers ?? {}) },
  })
}

export function apiError(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return json({ error: { code, message, ...extra } }, { status })
}

export async function requireStaffApi(): Promise<SessionUser | Response> {
  const user = await getCurrentUser()
  if (!user) return apiError(401, 'unauthorized', 'Tu sesión terminó. Vuelve a entrar.')
  if (!isStaff(user.role)) return apiError(403, 'forbidden', 'Esta función es solo para el personal de la biblioteca.')
  return user
}

export function limitApi(user: SessionUser, bucket: string, limit: number, windowMs: number): Response | null {
  const result = rateLimit(`${bucket}:${user.id}`, limit, windowMs)
  if (result.ok) return null
  return apiError(429, 'rate_limited', 'Demasiadas consultas seguidas. Espera unos segundos.', {
    retryAfter: result.retryAfterSeconds,
  })
}

export function providerErrorResponse(error: unknown): Response {
  if (error instanceof ProviderError) {
    const status = error.code === 'rate_limited' ? 429 : error.code === 'timeout' ? 504 : error.code === 'not_configured' ? 501 : 502
    return apiError(status, error.code, PROVIDER_ERROR_MESSAGE[error.code], {
      retryAfter: error.retryAfterSeconds ?? null,
    })
  }
  console.error('[metadatos] Error inesperado', error)
  return apiError(500, 'internal', 'Algo falló al consultar el proveedor. Inténtalo de nuevo.')
}
