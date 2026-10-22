import { randomBytes } from 'node:crypto'
import type { Role, SessionUser, UserStatus } from '@/lib/types'
import { ROLE_LABEL } from '@/lib/status'
import { ACCOUNT_CONSENTS } from '@/lib/legal'
import { logAudit } from './audit'
import { recordConsent } from './consents'
import { getDummyHash, hashPassword, verifyPassword } from './auth/password'
import { deleteUserSessions, hashToken } from './auth/session'
import { all, get, now, run, transaction } from './db'
import { env } from './env'
import { DomainError } from './errors'
import { sendInBackground } from './integrations/mail'

interface UserRow {
  id: number
  name: string
  email: string
  password_hash: string
  role: Role
  status: UserStatus
  card_number: string
  is_demo: number
  created_at: string
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Número de carné correlativo por año: GG-26-00042. */
async function nextCardNumber(): Promise<string> {
  const year = String(new Date().getUTCFullYear()).slice(-2)
  const prefix = `GG-${year}-`
  const last = (await get<{ card_number: string }>(
    'SELECT card_number FROM users WHERE card_number LIKE ? ORDER BY card_number DESC LIMIT 1',
    [`${prefix}%`],
  ))?.card_number
  const next = last ? Number(last.slice(prefix.length)) + 1 : 1
  return `${prefix}${String(next).padStart(5, '0')}`
}

export async function registerUser(input: {
  name: string
  email: string
  password: string
  role?: Role
  isDemo?: boolean
  /** Aceptaciones dadas en el formulario: se registran en la misma transacción que la cuenta. */
  consents?: { source: string; requestId?: string }
}): Promise<SessionUser> {
  const email = normalizeEmail(input.email)
  const passwordHash = await hashPassword(input.password)
  return await transaction(async () => {
    if (await get<{ id: number }>('SELECT id FROM users WHERE email = ?', [email])) {
      throw new DomainError('Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.', 'email_taken', {
        email: 'Este correo ya tiene una cuenta.',
      })
    }
    const cardNumber = await nextCardNumber()
    const role = input.role ?? 'reader'
    const { lastInsertRowid: id } = await run(
      `INSERT INTO users (name, email, password_hash, role, card_number, is_demo) VALUES (?, ?, ?, ?, ?, ?)`,
      [input.name.trim(), email, passwordHash, role, cardNumber, Boolean(input.isDemo)],
    )
    if (input.consents) {
      for (const c of ACCOUNT_CONSENTS) {
        await recordConsent({ userId: id, slug: c.slug, type: c.type, result: 'accepted', ...input.consents })
      }
    }
    await logAudit({ actorId: id, action: 'user.registered', entityType: 'user', entityId: id, summary: 'Creó su cuenta de lector' })
    return { id, name: input.name.trim(), email, role, status: 'active' as const, cardNumber }
  })
}

/** Comprueba credenciales en tiempo constante (también cuando el correo no existe). */
export async function authenticate(emailInput: string, password: string): Promise<SessionUser | null> {
  const email = normalizeEmail(emailInput)
  const user = await get<UserRow>('SELECT * FROM users WHERE email = ?', [email])
  const ok = await verifyPassword(password, user?.password_hash ?? (await getDummyHash()))
  if (!user || !ok) return null
  if (user.status !== 'active') {
    throw new DomainError('Tu cuenta está suspendida. Escríbenos para revisarla.', 'suspended')
  }
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    cardNumber: user.card_number,
  }
}

export async function updateProfileName(userId: number, name: string) {
  await run('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [name.trim(), now(), userId])
  await logAudit({ actorId: userId, action: 'user.profile_updated', entityType: 'user', entityId: userId, summary: 'Actualizó su perfil' })
}

export async function changePassword(userId: number, current: string, next: string, keepToken?: string) {
  const user = await get<UserRow>('SELECT * FROM users WHERE id = ?', [userId])
  if (!user) throw new DomainError('La cuenta ya no existe.', 'not_found')
  if (!(await verifyPassword(current, user.password_hash))) {
    throw new DomainError('La contraseña actual no es correcta.', 'wrong_password', {
      currentPassword: 'No coincide con tu contraseña actual.',
    })
  }
  const hash = await hashPassword(next)
  await run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, now(), userId])
  await deleteUserSessions(userId, keepToken)
  await logAudit({ actorId: userId, action: 'user.password_changed', entityType: 'user', entityId: userId, summary: 'Cambió su contraseña' })
}

const RESET_TTL_MS = 60 * 60 * 1000

/**
 * Crea un enlace de un solo uso válido una hora y lo envía por correo.
 * Responde igual exista o no la cuenta, para no revelar qué correos están registrados.
 */
export async function requestPasswordReset(emailInput: string) {
  const email = normalizeEmail(emailInput)
  const user = await get<UserRow>('SELECT * FROM users WHERE email = ?', [email])
  if (!user || user.status !== 'active') return
  const token = randomBytes(32).toString('base64url')
  await run('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', [user.id])
  await run('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [
    user.id,
    hashToken(token),
    new Date(Date.now() + RESET_TTL_MS).toISOString(),
  ])
  await logAudit({ actorId: user.id, action: 'user.reset_requested', entityType: 'user', entityId: user.id, summary: 'Pidió restablecer su contraseña' })
  sendInBackground({
    to: user.email,
    subject: 'Restablece tu contraseña de Biblioteca Gota Gota',
    text: [
      `Hola, ${user.name}:`,
      '',
      'Recibimos una solicitud para restablecer tu contraseña. Abre este enlace en la próxima hora:',
      `${env().APP_URL}/restablecer?token=${token}`,
      '',
      'Si no fuiste tú, ignora este mensaje: tu contraseña sigue siendo la misma.',
      '',
      'Biblioteca Gota Gota',
    ].join('\n'),
  })
}

export async function isResetTokenValid(token: string): Promise<boolean> {
  const row = await get<{ expires_at: string; used_at: string | null }>(
    'SELECT expires_at, used_at FROM password_resets WHERE token_hash = ?',
    [hashToken(token)],
  )
  return Boolean(row && !row.used_at && new Date(row.expires_at).getTime() > Date.now())
}

export async function resetPassword(token: string, password: string) {
  const hash = await hashPassword(password)
  await transaction(async () => {
    const row = await get<{ id: number; user_id: number; expires_at: string; used_at: string | null }>(
      'SELECT id, user_id, expires_at, used_at FROM password_resets WHERE token_hash = ?',
      [hashToken(token)],
    )
    if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
      throw new DomainError('El enlace caducó o ya se usó. Pide uno nuevo.', 'invalid_token')
    }
    await run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [hash, now(), row.user_id])
    await run('UPDATE password_resets SET used_at = ? WHERE id = ?', [now(), row.id])
    await deleteUserSessions(row.user_id)
    await logAudit({ actorId: row.user_id, action: 'user.password_reset', entityType: 'user', entityId: row.user_id, summary: 'Restableció su contraseña' })
  })
}

/* ───────────────────────── Administración ───────────────────────── */

export interface UserListItem {
  id: number
  name: string
  email: string
  role: Role
  status: UserStatus
  cardNumber: string
  createdAt: string
  activeLoans: number
  overdueLoans: number
  isDemo: boolean
}

export async function listUsers(options: { q?: string; role?: Role; status?: UserStatus; page: number; pageSize: number }) {
  const where: string[] = []
  const params: Record<string, string | number> = {}
  if (options.q?.trim()) {
    where.push('(u.name LIKE :q OR u.email LIKE :q OR u.card_number LIKE :q)')
    params.q = `%${options.q.trim()}%`
  }
  if (options.role) {
    where.push('u.role = :role')
    params.role = options.role
  }
  if (options.status) {
    where.push('u.status = :status')
    params.status = options.status
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM users u ${clause}`, params))?.n ?? 0
  const rows = await all<UserRow & { active_loans: number; overdue_loans: number }>(
    `SELECT u.*,
       (SELECT COUNT(*) FROM loans l WHERE l.user_id = u.id AND l.status IN ('pending','approved','checked_out')) AS active_loans,
       (SELECT COUNT(*) FROM loans l WHERE l.user_id = u.id AND l.status = 'checked_out' AND l.due_at < :now) AS overdue_loans
       FROM users u ${clause}
      ORDER BY u.created_at DESC, u.id DESC LIMIT :limit OFFSET :offset`,
    { ...params, now: now(), limit: options.pageSize, offset: (options.page - 1) * options.pageSize },
  )
  const users: UserListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    status: r.status,
    cardNumber: r.card_number,
    createdAt: r.created_at,
    activeLoans: r.active_loans,
    overdueLoans: r.overdue_loans,
    isDemo: Boolean(r.is_demo),
  }))
  return { users, total }
}

export async function getUserById(id: number): Promise<UserListItem | null> {
  const row = await get<UserRow & { active_loans: number; overdue_loans: number }>(
    `SELECT u.*,
       (SELECT COUNT(*) FROM loans l WHERE l.user_id = u.id AND l.status IN ('pending','approved','checked_out')) AS active_loans,
       (SELECT COUNT(*) FROM loans l WHERE l.user_id = u.id AND l.status = 'checked_out' AND l.due_at < ?) AS overdue_loans
       FROM users u WHERE u.id = ?`,
    [now(), id],
  )
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    cardNumber: row.card_number,
    createdAt: row.created_at,
    activeLoans: row.active_loans,
    overdueLoans: row.overdue_loans,
    isDemo: Boolean(row.is_demo),
  }
}

/** Solo administración. No se puede cambiar el propio rol ni dejar la biblioteca sin administradores. */
export async function setUserRole(adminId: number, userId: number, role: Role) {
  await transaction(async () => {
    if (adminId === userId) throw new DomainError('No puedes cambiar tu propio rol.', 'self')
    const user = await get<UserRow>('SELECT * FROM users WHERE id = ?', [userId])
    if (!user) throw new DomainError('La cuenta ya no existe.', 'not_found')
    if (user.role === 'admin' && role !== 'admin') {
      const admins = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'`))?.n ?? 0
      if (admins <= 1) throw new DomainError('Debe quedar al menos un administrador activo.', 'last_admin')
    }
    await run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, now(), userId])
    await deleteUserSessions(userId)
    await logAudit({
      actorId: adminId,
      action: 'user.role_changed',
      entityType: 'user',
      entityId: userId,
      summary: `Cambió el rol de ${user.name} a ${ROLE_LABEL[role]}`,
      details: { from: user.role, to: role },
    })
  })
}

/**
 * Suspender o reactivar. El personal bibliotecario solo puede actuar sobre lectores;
 * la administración, sobre cualquiera salvo sí misma.
 */
export async function setUserStatus(actor: { id: number; role: Role }, userId: number, status: UserStatus) {
  await transaction(async () => {
    if (actor.id === userId) throw new DomainError('No puedes suspender tu propia cuenta.', 'self')
    const user = await get<UserRow>('SELECT * FROM users WHERE id = ?', [userId])
    if (!user) throw new DomainError('La cuenta ya no existe.', 'not_found')
    if (actor.role !== 'admin' && user.role !== 'reader') {
      throw new DomainError('Solo la administración puede suspender cuentas del equipo.', 'forbidden')
    }
    if (user.role === 'admin' && status === 'suspended') {
      const admins = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'`))?.n ?? 0
      if (admins <= 1) throw new DomainError('Debe quedar al menos un administrador activo.', 'last_admin')
    }
    await run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [status, now(), userId])
    if (status === 'suspended') {
      await deleteUserSessions(userId)
      await run(`UPDATE reservations SET status = 'cancelled', updated_at = ? WHERE user_id = ? AND status = 'waiting'`, [now(), userId])
    }
    await logAudit({
      actorId: actor.id,
      action: status === 'suspended' ? 'user.suspended' : 'user.reactivated',
      entityType: 'user',
      entityId: userId,
      summary: status === 'suspended' ? `Suspendió la cuenta de ${user.name}` : `Reactivó la cuenta de ${user.name}`,
    })
  })
}

/** Oculta parte del correo para listados donde no hace falta verlo entero. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  if (local.length <= 2) return `${local[0] ?? ''}…@${domain}`
  return `${local.slice(0, 2)}…@${domain}`
}
