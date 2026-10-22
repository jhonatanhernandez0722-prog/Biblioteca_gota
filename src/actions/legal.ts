'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { ACCOUNT_CONSENTS } from '@/lib/legal'
import type { ActionState } from '@/lib/types'
import { requireUser } from '@/server/auth/current-user'
import { pendingConsents, recordConsent, revokeConsent } from '@/server/consents'
import { transaction } from '@/server/db'
import { isDomainError } from '@/server/errors'

/** Acepta las versiones vigentes que el usuario tiene pendientes. Cada casilla se valida por separado. */
export async function acceptPendingConsentsAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const user = await requireUser('/cuenta')
  const pending = pendingConsents(user.id)
  if (!pending.length) return { ok: true, message: 'Ya tienes aceptadas las versiones vigentes.' }
  const fieldErrors: Record<string, string> = {}
  for (const c of ACCOUNT_CONSENTS) {
    if (pending.includes(c.slug) && formData.get(c.field) !== 'on') {
      fieldErrors[c.field] =
        c.slug === 'terminos'
          ? 'Sin aceptar los términos vigentes no puedes pedir ni reservar libros.'
          : 'Sin la autorización de tratamiento no podemos gestionar tus préstamos.'
    }
  }
  if (Object.keys(fieldErrors).length) {
    return { ok: false, message: 'Marca las casillas que faltan para seguir pidiendo libros.', fieldErrors }
  }
  const requestId = randomUUID()
  transaction(() => {
    for (const c of ACCOUNT_CONSENTS) {
      if (pending.includes(c.slug)) {
        recordConsent({ userId: user.id, slug: c.slug, type: c.type, result: 'accepted', source: 'formulario:reaceptacion', requestId })
      }
    }
  })
  revalidatePath('/cuenta')
  return { ok: true, message: 'Aceptación registrada. Ya puedes pedir libros.' }
}

export async function revokePrivacyAction(_: ActionState | null, formData: FormData): Promise<ActionState> {
  const user = await requireUser('/cuenta/perfil')
  const parsed = z.object({ confirm: z.literal('on') }).safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { ok: false, message: 'Confirma que entiendes las consecuencias de revocar.' }
  try {
    revokeConsent(user.id, 'privacidad', 'perfil:revocacion', randomUUID())
  } catch (error) {
    if (isDomainError(error)) return { ok: false, message: error.message }
    throw error
  }
  revalidatePath('/cuenta', 'layout')
  return {
    ok: true,
    message:
      'Revocación registrada. No podrás pedir libros mientras no vuelvas a autorizar el tratamiento. Para borrar tus datos, escríbenos.',
  }
}
