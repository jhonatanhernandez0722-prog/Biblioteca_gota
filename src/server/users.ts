import { randomBytes } from 'node:crypto'
import {
  describeCard,
  type CardBrand,
  type DocumentType,
  normalizePhone,
  validateCreditCard,
  validateDocument,
  validateLoanCard,
} from '@/lib/identity'
import type { LoanCard, ReaderIdentity, Role, SessionUser, UserStatus } from '@/lib/types'
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
  phone: string | null
  document_type: DocumentType | null
  document_number: string | null
  card_brand: CardBrand | null
  card_last4: string | null
}

/** Lo que llega de un formulario: datos en bruto que se validan aquí. */
export interface IdentityInput {
  phone: string
  documentType: string
  documentNumber: string
  /** Número completo de la tarjeta: se valida y se descarta; solo quedan franquicia y últimos 4 dígitos. */
  creditCard: string
}

interface CleanIdentity {
  phone: string
  documentType: DocumentType
  documentNumber: string
  cardBrand: CardBrand
  cardLast4: string
}

/**
 * Valida teléfono, documento y tarjeta. Lanza un DomainError con un mensaje por campo,
 * con los mismos nombres de campo que el formulario.
 */
export function validateIdentity(input: IdentityInput): CleanIdentity {
  const errors: Record<string, string> = {}
  const phone = normalizePhone(input.phone)
  if (!phone) {
    errors.phone = input.phone.trim()
      ? 'Revisa el teléfono: 10 dígitos, celular (3…) o fijo (60…).'
      : 'Escribe tu número de teléfono.'
  }
  const doc = validateDocument(input.documentType, input.documentNumber)
  if (!doc.ok) errors[input.documentType ? 'documentNumber' : 'documentType'] = doc.message
  const card = validateCreditCard(input.creditCard)
  if (!card.ok) errors.creditCard = card.message
  if (!phone || !doc.ok || !card.ok) {
    throw new DomainError('Revisa los campos marcados.', 'invalid_identity', errors)
  }
  return {
    phone,
    documentType: input.documentType as DocumentType,
    documentNumber: doc.number,
    cardBrand: card.brand,
    cardLast4: card.last4,
  }
}

async function assertDocumentFree(identity: CleanIdentity, excludeUserId?: number) {
  const owner = await get<{ id: number }>(
    'SELECT id FROM users WHERE document_type = ? AND document_number = ? AND id <> ?',
    [identity.documentType, identity.documentNumber, excludeUserId ?? 0],
  )
  if (owner) {
    throw new DomainError('Ya hay una cuenta con ese documento. Inicia sesión o escríbenos si crees que es un error.', 'document_taken', {
      documentNumber: 'Este documento ya está registrado.',
    })
  }
}

function identityFromRow(row: Pick<UserRow, 'phone' | 'document_type' | 'document_number' | 'card_brand' | 'card_last4'>): ReaderIdentity {
  return {
    phone: row.phone,
    documentType: row.document_type,
    documentNumber: row.document_number,
    cardBrand: row.card_brand,
    cardLast4: row.card_last4,
    complete: Boolean(row.phone && row.document_type && row.document_number && row.card_brand && row.card_last4),
  }
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
  /** Teléfono, documento y tarjeta. El formulario de registro los exige; sin ellos no se pueden pedir préstamos. */
  identity?: IdentityInput
}): Promise<SessionUser> {
  const email = normalizeEmail(input.email)
  const identity = input.identity ? validateIdentity(input.identity) : null
  const passwordHash = await hashPassword(input.password)
  return await transaction(async () => {
    if (await get<{ id: number }>('SELECT id FROM users WHERE email = ?', [email])) {
      throw new DomainError('Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.', 'email_taken', {
        email: 'Este correo ya tiene una cuenta.',
      })
    }
    if (identity) await assertDocumentFree(identity)
    const cardNumber = await nextCardNumber()
    const role = input.role ?? 'reader'
    const { lastInsertRowid: id } = await run(
      `INSERT INTO users (name, email, password_hash, role, card_number, is_demo,
                          phone, document_type, document_number, card_brand, card_last4, identity_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.name.trim(),
        email,
        passwordHash,
        role,
        cardNumber,
        Boolean(input.isDemo),
        identity?.phone ?? null,
        identity?.documentType ?? null,
        identity?.documentNumber ?? null,
        identity?.cardBrand ?? null,
        identity?.cardLast4 ?? null,
        identity ? now() : null,
      ],
    )
    await run(`INSERT INTO loan_cards (user_id, number, label, is_primary) VALUES (?, ?, ?, TRUE)`, [
      id,
      cardNumber,
      PRIMARY_CARD_LABEL,
    ])
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

/* ───────────────────────── Identificación y carnés ───────────────────────── */

export const PRIMARY_CARD_LABEL = 'Carné de lector Gota Gota'
const MAX_LOAN_CARDS = 5

export async function getReaderIdentity(userId: number): Promise<ReaderIdentity> {
  const row = await get<UserRow>('SELECT * FROM users WHERE id = ?', [userId])
  if (!row) throw new DomainError('La cuenta ya no existe.', 'not_found')
  return identityFromRow(row)
}

export async function updateIdentity(userId: number, input: IdentityInput) {
  const identity = validateIdentity(input)
  await transaction(async () => {
    await assertDocumentFree(identity, userId)
    await run(
      `UPDATE users SET phone = ?, document_type = ?, document_number = ?, card_brand = ?, card_last4 = ?,
              identity_updated_at = ?, updated_at = ? WHERE id = ?`,
      [identity.phone, identity.documentType, identity.documentNumber, identity.cardBrand, identity.cardLast4, now(), now(), userId],
    )
    await logAudit({
      actorId: userId,
      action: 'user.identity_updated',
      entityType: 'user',
      entityId: userId,
      // Nunca datos completos en el registro de operaciones.
      summary: `Actualizó sus datos de préstamo (${identity.documentType}, ${describeCard(identity.cardBrand, identity.cardLast4)})`,
    })
  })
}

interface LoanCardRow {
  id: number
  user_id: number
  number: string
  label: string
  is_primary: number
  created_at: string
}

function toLoanCard(r: LoanCardRow): LoanCard {
  return { id: r.id, number: r.number, label: r.label, isPrimary: Boolean(r.is_primary), createdAt: r.created_at }
}

export async function listLoanCards(userId: number): Promise<LoanCard[]> {
  return (await all<LoanCardRow>('SELECT * FROM loan_cards WHERE user_id = ? ORDER BY is_primary DESC, created_at, id', [userId])).map(
    toLoanCard,
  )
}

/**
 * Registra un carné de préstamo en la cuenta. Si el número ya pertenece a esta cuenta,
 * lo devuelve; si pertenece a otra, lo rechaza sin revelar de quién es.
 */
export async function addLoanCard(userId: number, rawNumber: string, label?: string | null): Promise<LoanCard> {
  const parsed = validateLoanCard(rawNumber)
  if (!parsed.ok) throw new DomainError(parsed.message, 'invalid_card', { cardNumber: parsed.message })
  return await transaction(async () => {
    const existing = await get<LoanCardRow>('SELECT * FROM loan_cards WHERE number = ?', [parsed.number])
    if (existing) {
      if (existing.user_id === userId) return toLoanCard(existing)
      throw new DomainError('Ese carné no está asociado a tu cuenta. Revisa el número.', 'card_taken', {
        cardNumber: 'Este carné no es tuyo.',
      })
    }
    const count = (await get<{ n: number }>('SELECT COUNT(*) AS n FROM loan_cards WHERE user_id = ?', [userId]))?.n ?? 0
    if (count >= MAX_LOAN_CARDS) {
      throw new DomainError(`Puedes registrar hasta ${MAX_LOAN_CARDS} carnés. Elimina alguno en «Mi perfil».`, 'limit', {
        cardNumber: 'Has llegado al máximo de carnés.',
      })
    }
    const cleanLabel = label?.trim().slice(0, 60) || 'Carné adicional'
    const { lastInsertRowid: id } = await run('INSERT INTO loan_cards (user_id, number, label) VALUES (?, ?, ?)', [
      userId,
      parsed.number,
      cleanLabel,
    ])
    await logAudit({
      actorId: userId,
      action: 'loan_card.added',
      entityType: 'user',
      entityId: userId,
      summary: `Registró el carné ${parsed.number}`,
    })
    return { id, number: parsed.number, label: cleanLabel, isPrimary: false, createdAt: now() }
  })
}

/** El carné principal no se elimina; uno con préstamos en curso, tampoco. */
export async function removeLoanCard(userId: number, cardId: number) {
  await transaction(async () => {
    const card = await get<LoanCardRow>('SELECT * FROM loan_cards WHERE id = ? AND user_id = ?', [cardId, userId])
    if (!card) throw new DomainError('Ese carné ya no está en tu cuenta.', 'not_found')
    if (card.is_primary) throw new DomainError('El carné de lector de la biblioteca no se puede eliminar.', 'primary')
    const inUse = await get<{ id: number }>(
      `SELECT id FROM loans WHERE loan_card_id = ? AND status IN ('pending','approved','checked_out')
       UNION ALL SELECT id FROM reservations WHERE loan_card_id = ? AND status = 'waiting' LIMIT 1`,
      [cardId, cardId],
    )
    if (inUse) {
      throw new DomainError('Tienes un préstamo o una reserva en curso con este carné. Elimínalo cuando termine.', 'in_use')
    }
    await run('DELETE FROM loan_cards WHERE id = ?', [cardId])
    await logAudit({
      actorId: userId,
      action: 'loan_card.removed',
      entityType: 'user',
      entityId: userId,
      summary: `Eliminó el carné ${card.number}`,
    })
  })
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

export interface UserDetail extends UserListItem {
  identity: ReaderIdentity
  /** Suma de multas pendientes de pago, en COP. */
  pendingFines: number
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

export async function getUserById(id: number): Promise<UserDetail | null> {
  const row = await get<UserRow & { active_loans: number; overdue_loans: number; pending_fines: number }>(
    `SELECT u.*,
       (SELECT COUNT(*) FROM loans l WHERE l.user_id = u.id AND l.status IN ('pending','approved','checked_out')) AS active_loans,
       (SELECT COUNT(*) FROM loans l WHERE l.user_id = u.id AND l.status = 'checked_out' AND l.due_at < ?) AS overdue_loans,
       (SELECT COALESCE(SUM(f.amount), 0) FROM fines f WHERE f.user_id = u.id AND f.status = 'pending') AS pending_fines
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
    identity: identityFromRow(row),
    pendingFines: row.pending_fines,
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
