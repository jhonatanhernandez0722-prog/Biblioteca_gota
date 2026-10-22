import { cookies } from 'next/headers'

export const FLASH_COOKIE = 'gg_flash'

/**
 * Mensaje de confirmación que sobrevive a una redirección. Solo contiene el
 * texto del aviso (nunca datos sensibles); el navegador lo muestra y lo borra.
 */
export async function setFlash(message: string, tone: 'success' | 'info' | 'warning' = 'success') {
  ;(await cookies()).set(FLASH_COOKIE, JSON.stringify({ message, tone }), {
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60,
  })
}
