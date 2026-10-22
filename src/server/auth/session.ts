import { createHash, randomBytes } from 'node:crypto'
import type { SessionUser } from '@/lib/types'
import { get, run } from '../db'

export const SESSION_COOKIE = 'gg_session'
const SESSION_DAYS = 30
const DAY_MS = 86_400_000

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Crea la sesión. Solo el hash del token se guarda en la base de datos. */
export async function createSessionRecord(userId: number): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * DAY_MS)
  await run('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', [
    hashToken(token),
    userId,
    expiresAt.toISOString(),
  ])
  return { token, expiresAt }
}

interface SessionRow {
  session_id: string
  expires_at: string
  last_seen_at: string
  id: number
  name: string
  email: string
  role: SessionUser['role']
  status: SessionUser['status']
  card_number: string
}

export async function findSessionUser(token: string): Promise<SessionUser | null> {
  const id = hashToken(token)
  const row = await get<SessionRow>(
    `SELECT s.id AS session_id, s.expires_at, s.last_seen_at,
            u.id, u.name, u.email, u.role, u.status, u.card_number
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ?`,
    [id],
  )
  if (!row) return null
  const now = Date.now()
  if (new Date(row.expires_at).getTime() <= now) {
    await run('DELETE FROM sessions WHERE id = ?', [id])
    return null
  }
  if (row.status !== 'active') return null
  // Sesión deslizante: como mucho una escritura por hora.
  if (now - new Date(row.last_seen_at).getTime() > 3_600_000) {
    await run('UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?', [
      new Date(now).toISOString(),
      new Date(now + SESSION_DAYS * DAY_MS).toISOString(),
      id,
    ])
  }
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    cardNumber: row.card_number,
  }
}

export async function deleteSession(token: string) {
  await run('DELETE FROM sessions WHERE id = ?', [hashToken(token)])
}

export async function deleteUserSessions(userId: number, exceptToken?: string) {
  if (exceptToken) {
    await run('DELETE FROM sessions WHERE user_id = ? AND id <> ?', [userId, hashToken(exceptToken)])
  } else {
    await run('DELETE FROM sessions WHERE user_id = ?', [userId])
  }
}

export async function purgeExpiredSessions() {
  await run('DELETE FROM sessions WHERE expires_at <= ?', [new Date().toISOString()])
}
