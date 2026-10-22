import type { SQLInputValue } from 'node:sqlite'
import { addDays, endOfLibraryDay, formatDate } from '@/lib/dates'
import { LOAN_RULES } from '@/lib/rules'
import type { CopyCondition, CopyStatus, LoanRecord, LoanStatus, ReservationRecord } from '@/lib/types'
import { logAudit } from './audit'
import { getCopy, insertCopies } from './catalog'
import { pendingConsents } from './consents'
import { all, get, now, run, transaction } from './db'
import { env } from './env'
import { DomainError } from './errors'
import { sendInBackground, type MailMessage } from './integrations/mail'

/**
 * Circulación: solicitudes, préstamos, devoluciones, renovaciones y reservas.
 * Cada operación valida permisos y reglas aquí, en el servidor, dentro de una
 * transacción. La interfaz solo refleja el resultado.
 */

interface Actor {
  id: number
  isStaff: boolean
}

type Effect = () => void

/* ───────────────────────── Lectura ───────────────────────── */

const LOAN_SELECT = `
  SELECT l.*, u.name AS user_name, u.email AS user_email, u.card_number AS user_card,
         b.slug AS book_slug, b.title AS book_title, b.cover_key, b.cover_color,
         c.code AS copy_code,
         (SELECT group_concat(a.name, '|' ORDER BY a.position) FROM book_authors a WHERE a.book_id = b.id) AS authors
    FROM loans l
    JOIN users u ON u.id = l.user_id
    JOIN books b ON b.id = l.book_id
    LEFT JOIN copies c ON c.id = l.copy_id`

interface LoanRow {
  id: number
  user_id: number
  book_id: number
  copy_id: number | null
  status: LoanStatus
  requested_at: string
  decided_at: string | null
  pickup_deadline: string | null
  checked_out_at: string | null
  due_at: string | null
  returned_at: string | null
  renewals: number
  rejection_reason: string | null
  user_name: string
  user_email: string
  user_card: string
  book_slug: string
  book_title: string
  cover_key: string | null
  cover_color: string | null
  copy_code: string | null
  authors: string | null
}

function toLoan(r: LoanRow): LoanRecord {
  return {
    id: r.id,
    status: r.status,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    userCardNumber: r.user_card,
    bookId: r.book_id,
    bookSlug: r.book_slug,
    bookTitle: r.book_title,
    bookAuthors: r.authors ? r.authors.split('|') : [],
    coverKey: r.cover_key,
    coverColor: r.cover_color,
    copyId: r.copy_id,
    copyCode: r.copy_code,
    requestedAt: r.requested_at,
    decidedAt: r.decided_at,
    pickupDeadline: r.pickup_deadline,
    checkedOutAt: r.checked_out_at,
    dueAt: r.due_at,
    returnedAt: r.returned_at,
    renewals: r.renewals,
    rejectionReason: r.rejection_reason,
  }
}

export function getLoan(loanId: number): LoanRecord | null {
  const row = get<LoanRow>(`${LOAN_SELECT} WHERE l.id = ?`, [loanId])
  return row ? toLoan(row) : null
}

export function listUserLoans(userId: number): LoanRecord[] {
  return all<LoanRow>(`${LOAN_SELECT} WHERE l.user_id = ? ORDER BY l.requested_at DESC, l.id DESC`, [userId]).map(
    toLoan,
  )
}

const RESERVATION_SELECT = `
  SELECT r.*, u.name AS user_name, u.email AS user_email,
         b.slug AS book_slug, b.title AS book_title, b.cover_key, b.cover_color,
         (SELECT group_concat(a.name, '|' ORDER BY a.position) FROM book_authors a WHERE a.book_id = b.id) AS authors,
         CASE WHEN r.status = 'waiting' THEN (
           SELECT COUNT(*) FROM reservations r2
            WHERE r2.book_id = r.book_id AND r2.status = 'waiting'
              AND (r2.created_at < r.created_at OR (r2.created_at = r.created_at AND r2.id <= r.id))
         ) END AS position
    FROM reservations r
    JOIN users u ON u.id = r.user_id
    JOIN books b ON b.id = r.book_id`

interface ReservationRow {
  id: number
  user_id: number
  book_id: number
  status: ReservationRecord['status']
  created_at: string
  user_name: string
  user_email: string
  book_slug: string
  book_title: string
  cover_key: string | null
  cover_color: string | null
  authors: string | null
  position: number | null
}

function toReservation(r: ReservationRow): ReservationRecord {
  return {
    id: r.id,
    status: r.status,
    userId: r.user_id,
    userName: r.user_name,
    userEmail: r.user_email,
    bookId: r.book_id,
    bookSlug: r.book_slug,
    bookTitle: r.book_title,
    bookAuthors: r.authors ? r.authors.split('|') : [],
    coverKey: r.cover_key,
    coverColor: r.cover_color,
    createdAt: r.created_at,
    position: r.position,
  }
}

export function listUserReservations(userId: number): ReservationRecord[] {
  return all<ReservationRow>(`${RESERVATION_SELECT} WHERE r.user_id = ? ORDER BY r.created_at DESC`, [userId]).map(
    toReservation,
  )
}

/** Estado de un libro para un lector concreto: ¿lo tiene pedido, prestado o reservado? */
export function getUserBookState(userId: number, bookId: number) {
  const loanRow = get<LoanRow>(
    `${LOAN_SELECT} WHERE l.user_id = ? AND l.book_id = ? AND l.status IN ('pending','approved','checked_out')`,
    [userId, bookId],
  )
  const reservationRow = get<ReservationRow>(
    `${RESERVATION_SELECT} WHERE r.user_id = ? AND r.book_id = ? AND r.status = 'waiting'`,
    [userId, bookId],
  )
  return {
    loan: loanRow ? toLoan(loanRow) : null,
    reservation: reservationRow ? toReservation(reservationRow) : null,
  }
}

/** Situación de los ejemplares de un libro (para el personal). */
export function getBookCirculation(bookId: number) {
  const counts = Object.fromEntries(
    all<{ status: CopyStatus; n: number }>(
      'SELECT status, COUNT(*) AS n FROM copies WHERE book_id = ? GROUP BY status',
      [bookId],
    ).map((r) => [r.status, r.n]),
  ) as Partial<Record<CopyStatus, number>>
  const pending =
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE book_id = ? AND status = 'pending'`, [bookId])?.n ?? 0
  const waiting =
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM reservations WHERE book_id = ? AND status = 'waiting'`, [bookId])
      ?.n ?? 0
  return { copies: counts, pending, waiting }
}

/** Lector: ¿puede pedir libros ahora mismo? Devuelve el motivo si no. */
export function getReaderEligibility(userId: number): { canRequest: boolean; reason?: string } {
  const user = get<{ status: string }>('SELECT status FROM users WHERE id = ?', [userId])
  if (!user || user.status !== 'active') {
    return { canRequest: false, reason: 'Tu cuenta está suspendida. Escríbenos para revisarla.' }
  }
  if (pendingConsents(userId).length) {
    return {
      canRequest: false,
      reason:
        'Para pedir libros necesitas aceptar la versión vigente de los términos y autorizar el tratamiento de tus datos. Puedes hacerlo en «Mis préstamos».',
    }
  }
  if (countOverdue(userId) > 0) {
    return { canRequest: false, reason: 'Tienes un préstamo vencido. Devuélvelo para poder pedir otro libro.' }
  }
  if (countActiveLoans(userId) >= LOAN_RULES.maxActiveLoans) {
    return {
      canRequest: false,
      reason: `Ya tienes ${LOAN_RULES.maxActiveLoans} libros pedidos o prestados, el máximo a la vez.`,
    }
  }
  return { canRequest: true }
}

/* ───────────────────────── Ayudas internas ───────────────────────── */

function countOverdue(userId: number): number {
  return (
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE user_id = ? AND status = 'checked_out' AND due_at < ?`, [
      userId,
      now(),
    ])?.n ?? 0
  )
}

function countActiveLoans(userId: number): number {
  return (
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM loans WHERE user_id = ? AND status IN ('pending','approved','checked_out')`,
      [userId],
    )?.n ?? 0
  )
}

function freeCopies(bookId: number): number {
  const available =
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM copies WHERE book_id = ? AND status = 'available'`, [bookId])?.n ?? 0
  const pending =
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE book_id = ? AND status = 'pending'`, [bookId])?.n ?? 0
  return Math.max(0, available - pending)
}

function pickupDeadline(): string {
  return endOfLibraryDay(addDays(new Date(), LOAN_RULES.pickupDays)).toISOString()
}

function dueDateFrom(base: Date): string {
  return endOfLibraryDay(addDays(base, LOAN_RULES.loanDays)).toISOString()
}

function bookTitle(bookId: number): string {
  return get<{ title: string }>('SELECT title FROM books WHERE id = ?', [bookId])?.title ?? 'el libro'
}

function readyForPickupMail(to: string, name: string, title: string, deadline: string): MailMessage {
  return {
    to,
    subject: `Tu libro está listo para recoger: ${title}`,
    text: [
      `Hola, ${name}:`,
      '',
      `El ejemplar de «${title}» está apartado a tu nombre. Puedes recogerlo en el mostrador hasta el ${formatDate(deadline)}.`,
      '',
      `Consulta tus préstamos: ${env().APP_URL}/cuenta`,
      '',
      'Biblioteca Gota Gota',
    ].join('\n'),
  }
}

/**
 * Un ejemplar vuelve a la estantería. Si hay lectores esperando ese libro, el
 * primero de la cola recibe el ejemplar apartado (préstamo aprobado para recoger).
 */
function releaseCopy(copyId: number, actorId: number | null, effects: Effect[]) {
  const copy = get<{ id: number; book_id: number; code: string }>('SELECT id, book_id, code FROM copies WHERE id = ?', [
    copyId,
  ])
  if (!copy) return
  const queue = all<{ id: number; user_id: number; created_at: string }>(
    `SELECT id, user_id, created_at FROM reservations
      WHERE book_id = ? AND status = 'waiting' ORDER BY created_at, id`,
    [copy.book_id],
  )
  for (const reservation of queue) {
    const reader = get<{ id: number; name: string; email: string; status: string }>(
      'SELECT id, name, email, status FROM users WHERE id = ?',
      [reservation.user_id],
    )
    const alreadyHasIt = get<{ id: number }>(
      `SELECT id FROM loans WHERE user_id = ? AND book_id = ? AND status IN ('pending','approved','checked_out')`,
      [reservation.user_id, copy.book_id],
    )
    if (!reader || reader.status !== 'active' || alreadyHasIt) {
      run(`UPDATE reservations SET status = 'cancelled', updated_at = ? WHERE id = ?`, [now(), reservation.id])
      continue
    }
    const deadline = pickupDeadline()
    const { lastInsertRowid: loanId } = run(
      `INSERT INTO loans (user_id, book_id, copy_id, status, decided_at, decided_by, pickup_deadline)
       VALUES (?, ?, ?, 'approved', ?, ?, ?)`,
      [reader.id, copy.book_id, copy.id, now(), actorId, deadline],
    )
    run(`UPDATE reservations SET status = 'fulfilled', loan_id = ?, updated_at = ? WHERE id = ?`, [
      loanId,
      now(),
      reservation.id,
    ])
    run(`UPDATE copies SET status = 'reserved', updated_at = ? WHERE id = ?`, [now(), copy.id])
    const title = bookTitle(copy.book_id)
    logAudit({
      actorId,
      action: 'reservation.fulfilled',
      entityType: 'reservation',
      entityId: reservation.id,
      summary: `Apartó el ejemplar ${copy.code} de «${title}» para ${reader.name} (reserva atendida)`,
      details: { loanId },
    })
    effects.push(() => sendInBackground(readyForPickupMail(reader.email, reader.name, title, deadline)))
    return
  }
  run(`UPDATE copies SET status = 'available', updated_at = ? WHERE id = ?`, [now(), copy.id])
}

function runEffects(effects: Effect[]) {
  for (const effect of effects) effect()
}

function loadLoanForUpdate(loanId: number) {
  const loan = get<{
    id: number
    user_id: number
    book_id: number
    copy_id: number | null
    status: LoanStatus
    due_at: string | null
    renewals: number
  }>('SELECT id, user_id, book_id, copy_id, status, due_at, renewals FROM loans WHERE id = ?', [loanId])
  if (!loan) throw new DomainError('Ese préstamo ya no existe.', 'not_found')
  return loan
}

/* ───────────────────────── Lector ───────────────────────── */

export function requestLoan(userId: number, bookId: number): { loanId: number } {
  return transaction(() => {
    const eligibility = getReaderEligibility(userId)
    if (!eligibility.canRequest) throw new DomainError(eligibility.reason!, 'not_eligible')
    const book = get<{ id: number; title: string }>(`SELECT id, title FROM books WHERE id = ? AND status = 'active'`, [
      bookId,
    ])
    if (!book) throw new DomainError('Este libro ya no está en el catálogo.', 'not_found')
    const existing = get<{ id: number }>(
      `SELECT id FROM loans WHERE user_id = ? AND book_id = ? AND status IN ('pending','approved','checked_out')`,
      [userId, bookId],
    )
    if (existing) throw new DomainError('Ya tienes una solicitud o un préstamo de este libro.', 'duplicate')
    if (freeCopies(bookId) <= 0) {
      throw new DomainError(
        'No quedan ejemplares libres. Puedes reservarlo y te avisaremos cuando vuelva uno.',
        'no_copies',
      )
    }
    run(`UPDATE reservations SET status = 'cancelled', updated_at = ? WHERE user_id = ? AND book_id = ? AND status = 'waiting'`, [
      now(),
      userId,
      bookId,
    ])
    const { lastInsertRowid: loanId } = run(`INSERT INTO loans (user_id, book_id, status) VALUES (?, ?, 'pending')`, [
      userId,
      bookId,
    ])
    logAudit({
      actorId: userId,
      action: 'loan.requested',
      entityType: 'loan',
      entityId: loanId,
      summary: `Solicitó «${book.title}»`,
    })
    return { loanId }
  })
}

export function reserveBook(userId: number, bookId: number): { reservationId: number; position: number } {
  return transaction(() => {
    const user = get<{ status: string }>('SELECT status FROM users WHERE id = ?', [userId])
    if (!user || user.status !== 'active') {
      throw new DomainError('Tu cuenta está suspendida. Escríbenos para revisarla.', 'not_eligible')
    }
    if (pendingConsents(userId).length) {
      throw new DomainError('Acepta la versión vigente de los términos y la autorización de datos en «Mis préstamos» para reservar.', 'not_eligible')
    }
    const book = get<{ id: number; title: string }>(`SELECT id, title FROM books WHERE id = ? AND status = 'active'`, [
      bookId,
    ])
    if (!book) throw new DomainError('Este libro ya no está en el catálogo.', 'not_found')
    const total =
      get<{ n: number }>(`SELECT COUNT(*) AS n FROM copies WHERE book_id = ? AND status NOT IN ('lost','withdrawn')`, [
        bookId,
      ])?.n ?? 0
    if (total === 0) {
      throw new DomainError('Este título todavía no tiene ejemplares en la biblioteca, así que no se puede reservar.', 'no_copies')
    }
    if (freeCopies(bookId) > 0) {
      throw new DomainError('Hay ejemplares libres: solicita el préstamo directamente.', 'copies_available')
    }
    const hasLoan = get<{ id: number }>(
      `SELECT id FROM loans WHERE user_id = ? AND book_id = ? AND status IN ('pending','approved','checked_out')`,
      [userId, bookId],
    )
    if (hasLoan) throw new DomainError('Ya tienes este libro pedido o prestado.', 'duplicate')
    const waiting = get<{ id: number }>(
      `SELECT id FROM reservations WHERE user_id = ? AND book_id = ? AND status = 'waiting'`,
      [userId, bookId],
    )
    if (waiting) throw new DomainError('Ya estás en la lista de espera de este libro.', 'duplicate')
    const myWaiting =
      get<{ n: number }>(`SELECT COUNT(*) AS n FROM reservations WHERE user_id = ? AND status = 'waiting'`, [userId])
        ?.n ?? 0
    if (myWaiting >= LOAN_RULES.maxActiveReservations) {
      throw new DomainError(
        `Ya tienes ${LOAN_RULES.maxActiveReservations} reservas en espera, el máximo a la vez.`,
        'limit',
      )
    }
    const { lastInsertRowid: reservationId } = run('INSERT INTO reservations (user_id, book_id) VALUES (?, ?)', [
      userId,
      bookId,
    ])
    const position =
      get<{ n: number }>(`SELECT COUNT(*) AS n FROM reservations WHERE book_id = ? AND status = 'waiting'`, [bookId])
        ?.n ?? 1
    logAudit({
      actorId: userId,
      action: 'reservation.created',
      entityType: 'reservation',
      entityId: reservationId,
      summary: `Reservó «${book.title}» (puesto ${position} en la cola)`,
    })
    return { reservationId, position }
  })
}

export function cancelReservation(actor: Actor, reservationId: number) {
  transaction(() => {
    const reservation = get<{ id: number; user_id: number; book_id: number; status: string }>(
      'SELECT id, user_id, book_id, status FROM reservations WHERE id = ?',
      [reservationId],
    )
    if (!reservation) throw new DomainError('Esa reserva ya no existe.', 'not_found')
    if (!actor.isStaff && reservation.user_id !== actor.id) {
      throw new DomainError('No puedes cancelar la reserva de otra persona.', 'forbidden')
    }
    if (reservation.status !== 'waiting') throw new DomainError('La reserva ya no está en espera.', 'invalid_state')
    run(`UPDATE reservations SET status = 'cancelled', updated_at = ? WHERE id = ?`, [now(), reservationId])
    logAudit({
      actorId: actor.id,
      action: 'reservation.cancelled',
      entityType: 'reservation',
      entityId: reservationId,
      summary: `Canceló la reserva de «${bookTitle(reservation.book_id)}»`,
    })
  })
}

export function cancelLoan(actor: Actor, loanId: number) {
  const effects: Effect[] = []
  transaction(() => {
    const loan = loadLoanForUpdate(loanId)
    if (!actor.isStaff && loan.user_id !== actor.id) {
      throw new DomainError('No puedes cancelar la solicitud de otra persona.', 'forbidden')
    }
    if (loan.status !== 'pending' && loan.status !== 'approved') {
      throw new DomainError('Solo se pueden cancelar solicitudes pendientes o ejemplares por recoger.', 'invalid_state')
    }
    run(`UPDATE loans SET status = 'cancelled', updated_at = ? WHERE id = ?`, [now(), loanId])
    if (loan.status === 'approved' && loan.copy_id) releaseCopy(loan.copy_id, actor.id, effects)
    logAudit({
      actorId: actor.id,
      action: 'loan.cancelled',
      entityType: 'loan',
      entityId: loanId,
      summary: `Canceló la solicitud de «${bookTitle(loan.book_id)}»`,
    })
  })
  runEffects(effects)
}

export function renewLoan(actor: Actor, loanId: number): { dueAt: string } {
  return transaction(() => {
    const loan = loadLoanForUpdate(loanId)
    if (!actor.isStaff && loan.user_id !== actor.id) {
      throw new DomainError('No puedes renovar el préstamo de otra persona.', 'forbidden')
    }
    if (loan.status !== 'checked_out' || !loan.due_at) {
      throw new DomainError('Solo se pueden renovar libros que estén prestados.', 'invalid_state')
    }
    if (new Date(loan.due_at).getTime() < Date.now()) {
      throw new DomainError('El préstamo ya venció y no se puede renovar. Devuélvelo en el mostrador.', 'overdue')
    }
    if (loan.renewals >= LOAN_RULES.maxRenewals) {
      throw new DomainError(`Este préstamo ya usó sus ${LOAN_RULES.maxRenewals} renovaciones.`, 'limit')
    }
    const waiting =
      get<{ n: number }>(`SELECT COUNT(*) AS n FROM reservations WHERE book_id = ? AND status = 'waiting'`, [
        loan.book_id,
      ])?.n ?? 0
    if (waiting > 0) {
      throw new DomainError('Otra persona está esperando este libro, así que no se puede renovar.', 'reserved')
    }
    const dueAt = dueDateFrom(new Date(loan.due_at))
    run('UPDATE loans SET due_at = ?, renewals = renewals + 1, updated_at = ? WHERE id = ?', [dueAt, now(), loanId])
    logAudit({
      actorId: actor.id,
      action: 'loan.renewed',
      entityType: 'loan',
      entityId: loanId,
      summary: `Renovó «${bookTitle(loan.book_id)}» hasta el ${formatDate(dueAt)}`,
    })
    return { dueAt }
  })
}

/* ───────────────────────── Personal de biblioteca ───────────────────────── */

function assignCopy(loan: { id: number; book_id: number }, staffId: number, copyId?: number): { copyId: number; deadline: string } {
  const copy = copyId
    ? get<{ id: number; book_id: number; status: CopyStatus }>('SELECT id, book_id, status FROM copies WHERE id = ?', [
        copyId,
      ])
    : get<{ id: number; book_id: number; status: CopyStatus }>(
        `SELECT id, book_id, status FROM copies WHERE book_id = ? AND status = 'available'
          ORDER BY CASE condition WHEN 'new' THEN 0 WHEN 'good' THEN 1 WHEN 'worn' THEN 2 ELSE 3 END, code LIMIT 1`,
        [loan.book_id],
      )
  if (!copy || copy.book_id !== loan.book_id || copy.status !== 'available') {
    throw new DomainError(
      'No hay ejemplares en estantería para esta solicitud. Recházala indicando el motivo o espera una devolución.',
      'no_copies',
    )
  }
  const deadline = pickupDeadline()
  run(`UPDATE copies SET status = 'reserved', updated_at = ? WHERE id = ?`, [now(), copy.id])
  run(
    `UPDATE loans SET status = 'approved', copy_id = ?, decided_at = ?, decided_by = ?, pickup_deadline = ?, updated_at = ?
      WHERE id = ?`,
    [copy.id, now(), staffId, deadline, now(), loan.id],
  )
  return { copyId: copy.id, deadline }
}

export function approveLoan(staffId: number, loanId: number, copyId?: number) {
  const effects: Effect[] = []
  transaction(() => {
    const loan = loadLoanForUpdate(loanId)
    if (loan.status !== 'pending') throw new DomainError('Solo se pueden aprobar solicitudes pendientes.', 'invalid_state')
    const { deadline } = assignCopy(loan, staffId, copyId)
    const reader = get<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [loan.user_id])!
    const title = bookTitle(loan.book_id)
    logAudit({
      actorId: staffId,
      action: 'loan.approved',
      entityType: 'loan',
      entityId: loanId,
      summary: `Aprobó la solicitud de ${reader.name} para «${title}»`,
    })
    effects.push(() => sendInBackground(readyForPickupMail(reader.email, reader.name, title, deadline)))
  })
  runEffects(effects)
}

export function rejectLoan(staffId: number, loanId: number, reason: string) {
  const effects: Effect[] = []
  const cleanReason = reason.trim()
  if (cleanReason.length < 5) {
    throw new DomainError('Explica el motivo del rechazo (al menos 5 caracteres): el lector lo verá.', 'reason_required', {
      reason: 'Escribe el motivo.',
    })
  }
  transaction(() => {
    const loan = loadLoanForUpdate(loanId)
    if (loan.status !== 'pending' && loan.status !== 'approved') {
      throw new DomainError('Solo se pueden rechazar solicitudes pendientes o por recoger.', 'invalid_state')
    }
    run(
      `UPDATE loans SET status = 'rejected', rejection_reason = ?, decided_at = ?, decided_by = ?, updated_at = ? WHERE id = ?`,
      [cleanReason.slice(0, 300), now(), staffId, now(), loanId],
    )
    if (loan.status === 'approved' && loan.copy_id) releaseCopy(loan.copy_id, staffId, effects)
    const reader = get<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [loan.user_id])!
    const title = bookTitle(loan.book_id)
    logAudit({
      actorId: staffId,
      action: 'loan.rejected',
      entityType: 'loan',
      entityId: loanId,
      summary: `Rechazó la solicitud de ${reader.name} para «${title}»`,
      details: { reason: cleanReason },
    })
    effects.push(() =>
      sendInBackground({
        to: reader.email,
        subject: `Tu solicitud de «${title}» no fue aprobada`,
        text: [
          `Hola, ${reader.name}:`,
          '',
          `La biblioteca no pudo aprobar tu solicitud de «${title}».`,
          `Motivo: ${cleanReason}`,
          '',
          `Puedes revisar tus préstamos en ${env().APP_URL}/cuenta`,
          '',
          'Biblioteca Gota Gota',
        ].join('\n'),
      }),
    )
  })
  runEffects(effects)
}

/** Entrega en el mostrador. Una solicitud pendiente se aprueba y entrega en un solo paso. */
export function checkoutLoan(staffId: number, loanId: number): { dueAt: string } {
  return transaction(() => {
    const loan = loadLoanForUpdate(loanId)
    let copyId = loan.copy_id
    if (loan.status === 'pending') {
      copyId = assignCopy(loan, staffId).copyId
    } else if (loan.status !== 'approved') {
      throw new DomainError('Solo se pueden entregar solicitudes pendientes o ejemplares apartados.', 'invalid_state')
    }
    if (!copyId) throw new DomainError('La solicitud no tiene un ejemplar asignado.', 'invalid_state')
    const dueAt = dueDateFrom(new Date())
    run(`UPDATE copies SET status = 'on_loan', updated_at = ? WHERE id = ?`, [now(), copyId])
    run(
      `UPDATE loans SET status = 'checked_out', checked_out_at = ?, checked_out_by = ?, due_at = ?, updated_at = ?
        WHERE id = ?`,
      [now(), staffId, dueAt, now(), loanId],
    )
    const code = get<{ code: string }>('SELECT code FROM copies WHERE id = ?', [copyId])?.code
    logAudit({
      actorId: staffId,
      action: 'loan.checked_out',
      entityType: 'loan',
      entityId: loanId,
      summary: `Entregó el ejemplar ${code} de «${bookTitle(loan.book_id)}» (devolución: ${formatDate(dueAt)})`,
    })
    return { dueAt }
  })
}

export function returnLoan(staffId: number, loanId: number, options: { toMaintenance?: boolean } = {}) {
  const effects: Effect[] = []
  transaction(() => {
    const loan = loadLoanForUpdate(loanId)
    if (loan.status !== 'checked_out') throw new DomainError('Ese libro no figura como prestado.', 'invalid_state')
    run(`UPDATE loans SET status = 'returned', returned_at = ?, returned_by = ?, updated_at = ? WHERE id = ?`, [
      now(),
      staffId,
      now(),
      loanId,
    ])
    if (loan.copy_id) {
      if (options.toMaintenance) {
        run(`UPDATE copies SET status = 'maintenance', updated_at = ? WHERE id = ?`, [now(), loan.copy_id])
      } else {
        releaseCopy(loan.copy_id, staffId, effects)
      }
    }
    logAudit({
      actorId: staffId,
      action: 'loan.returned',
      entityType: 'loan',
      entityId: loanId,
      summary: `Registró la devolución de «${bookTitle(loan.book_id)}»${options.toMaintenance ? ' (a reparación)' : ''}`,
    })
  })
  runEffects(effects)
}

/** Caduca los apartados que nadie recogió a tiempo y devuelve los ejemplares a la cola. */
export function expireStalePickups(): number {
  const stale = all<{ id: number; copy_id: number | null; book_id: number }>(
    `SELECT id, copy_id, book_id FROM loans WHERE status = 'approved' AND pickup_deadline < ?`,
    [now()],
  )
  if (stale.length === 0) return 0
  const effects: Effect[] = []
  transaction(() => {
    for (const loan of stale) {
      run(`UPDATE loans SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'approved'`, [now(), loan.id])
      if (loan.copy_id) releaseCopy(loan.copy_id, null, effects)
      logAudit({
        actorId: null,
        action: 'loan.expired',
        entityType: 'loan',
        entityId: loan.id,
        summary: `Venció el plazo para recoger «${bookTitle(loan.book_id)}»`,
      })
    }
  })
  runEffects(effects)
  return stale.length
}

export function addCopies(
  staffId: number,
  bookId: number,
  count: number,
  options: { location?: string | null; condition?: CopyCondition },
) {
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new DomainError('Indica entre 1 y 50 ejemplares.', 'invalid_count', { count: 'Entre 1 y 50.' })
  }
  const effects: Effect[] = []
  transaction(() => {
    const book = get<{ title: string; status: string }>('SELECT title, status FROM books WHERE id = ?', [bookId])
    if (!book) throw new DomainError('La ficha ya no existe.', 'not_found')
    const ids = insertCopies(bookId, count, options)
    for (const id of ids) releaseCopy(id, staffId, effects)
    logAudit({
      actorId: staffId,
      action: 'copy.added',
      entityType: 'book',
      entityId: bookId,
      summary: `Registró ${count} ejemplar(es) de «${book.title}»`,
    })
  })
  runEffects(effects)
}

const MANUAL_COPY_STATUSES: CopyStatus[] = ['available', 'maintenance', 'lost', 'withdrawn']

export function setCopyStatus(staffId: number, copyId: number, status: CopyStatus) {
  if (!MANUAL_COPY_STATUSES.includes(status)) {
    throw new DomainError('Ese estado lo asigna el sistema al prestar o apartar.', 'invalid_status')
  }
  const effects: Effect[] = []
  transaction(() => {
    const copy = getCopy(copyId)
    if (!copy) throw new DomainError('El ejemplar ya no existe.', 'not_found')
    if (copy.status === 'reserved' || copy.status === 'on_loan') {
      throw new DomainError(
        'Este ejemplar está en un préstamo en curso. Cierra el préstamo antes de cambiar su estado.',
        'in_circulation',
      )
    }
    if (copy.status === status) return
    if (status === 'available') {
      releaseCopy(copyId, staffId, effects)
    } else {
      run('UPDATE copies SET status = ?, updated_at = ? WHERE id = ?', [status, now(), copyId])
    }
    logAudit({
      actorId: staffId,
      action: 'copy.status_changed',
      entityType: 'copy',
      entityId: copyId,
      summary: `Cambió el ejemplar ${copy.code} de «${bookTitle(copy.bookId)}» a «${status}»`,
      details: { from: copy.status, to: status },
    })
  })
  runEffects(effects)
}

/* ───────────────────────── Listados para el panel ───────────────────────── */

export type StaffLoanView = 'requests' | 'pickup' | 'active' | 'overdue' | 'history'

const VIEW_FILTER: Record<StaffLoanView, { where: string; order: string }> = {
  requests: { where: `l.status = 'pending'`, order: 'l.requested_at ASC' },
  pickup: { where: `l.status = 'approved'`, order: 'l.pickup_deadline ASC' },
  active: { where: `l.status = 'checked_out' AND l.due_at >= :now`, order: 'l.due_at ASC' },
  overdue: { where: `l.status = 'checked_out' AND l.due_at < :now`, order: 'l.due_at ASC' },
  history: {
    where: `l.status IN ('returned','rejected','cancelled','expired')`,
    order: 'l.updated_at DESC, l.id DESC',
  },
}

export function listStaffLoans(options: { view: StaffLoanView; q?: string; page: number; pageSize: number }) {
  const filter = VIEW_FILTER[options.view]
  const params: Record<string, SQLInputValue> = {}
  const where = [filter.where]
  if (filter.where.includes(':now')) params.now = now()
  if (options.q?.trim()) {
    where.push(`(u.name LIKE :q OR u.email LIKE :q OR u.card_number LIKE :q OR b.title LIKE :q OR c.code LIKE :q)`)
    params.q = `%${options.q.trim()}%`
  }
  const clause = `WHERE ${where.join(' AND ')}`
  const total =
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM loans l JOIN users u ON u.id = l.user_id JOIN books b ON b.id = l.book_id
         LEFT JOIN copies c ON c.id = l.copy_id ${clause}`,
      params,
    )?.n ?? 0
  const loans = all<LoanRow>(`${LOAN_SELECT} ${clause} ORDER BY ${filter.order} LIMIT :limit OFFSET :offset`, {
    ...params,
    limit: options.pageSize,
    offset: (options.page - 1) * options.pageSize,
  }).map(toLoan)
  return { loans, total }
}

export function countStaffLoanViews(): Record<StaffLoanView | 'reservations', number> {
  const n = now()
  const count = (sql: string, params: SQLInputValue[] = []) => get<{ n: number }>(sql, params)?.n ?? 0
  return {
    requests: count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'pending'`),
    pickup: count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'approved'`),
    active: count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'checked_out' AND due_at >= ?`, [n]),
    overdue: count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'checked_out' AND due_at < ?`, [n]),
    history: count(`SELECT COUNT(*) AS n FROM loans WHERE status IN ('returned','rejected','cancelled','expired')`),
    reservations: count(`SELECT COUNT(*) AS n FROM reservations WHERE status = 'waiting'`),
  }
}

export function listWaitingReservations(options: { q?: string; page: number; pageSize: number }) {
  const params: Record<string, SQLInputValue> = {}
  const where = [`r.status = 'waiting'`]
  if (options.q?.trim()) {
    where.push('(u.name LIKE :q OR u.email LIKE :q OR b.title LIKE :q)')
    params.q = `%${options.q.trim()}%`
  }
  const clause = `WHERE ${where.join(' AND ')}`
  const total =
    get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM reservations r JOIN users u ON u.id = r.user_id JOIN books b ON b.id = r.book_id ${clause}`,
      params,
    )?.n ?? 0
  const reservations = all<ReservationRow>(
    `${RESERVATION_SELECT} ${clause} ORDER BY b.title, r.created_at LIMIT :limit OFFSET :offset`,
    { ...params, limit: options.pageSize, offset: (options.page - 1) * options.pageSize },
  ).map(toReservation)
  return { reservations, total }
}

export function countWaitingReservations(bookId: number): number {
  return (
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM reservations WHERE book_id = ? AND status = 'waiting'`, [bookId])?.n ?? 0
  )
}

/** Préstamos efectivamente entregados: decide si ordenar por popularidad tiene sentido. */
export function countCirculatedLoans(): number {
  return get<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE status IN ('checked_out','returned')`)?.n ?? 0
}

export function getDashboardStats() {
  const n = now()
  const count = (sql: string, params: SQLInputValue[] = []) => get<{ n: number }>(sql, params)?.n ?? 0
  return {
    books: count(`SELECT COUNT(*) AS n FROM books WHERE status = 'active'`),
    copiesTotal: count(`SELECT COUNT(*) AS n FROM copies WHERE status NOT IN ('lost','withdrawn')`),
    copiesAvailable: count(`SELECT COUNT(*) AS n FROM copies WHERE status = 'available'`),
    activeLoans: count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'checked_out'`),
    pendingRequests: count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'pending'`),
    pickups: count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'approved'`),
    overdue: count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'checked_out' AND due_at < ?`, [n]),
    waitingReservations: count(`SELECT COUNT(*) AS n FROM reservations WHERE status = 'waiting'`),
    readers: count(`SELECT COUNT(*) AS n FROM users WHERE role = 'reader' AND status = 'active'`),
  }
}
