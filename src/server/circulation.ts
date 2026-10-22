import { addDays, endOfLibraryDay, formatDate } from '@/lib/dates'
import { accruedFine, describeLate, formatCOP } from '@/lib/fines'
import { FINE_RULES, isLoanPeriod, LOAN_RULES } from '@/lib/rules'
import type {
  CopyCondition,
  CopyStatus,
  FineRecord,
  FineStatus,
  LoanRecord,
  LoanStatus,
  ReservationRecord,
} from '@/lib/types'
import { logAudit } from './audit'
import { getCopy, insertCopies } from './catalog'
import { pendingConsents } from './consents'
import { all, get, now, run, transaction, type SqlValue } from './db'
import { env } from './env'
import { DomainError } from './errors'
import { sendInBackground, type MailMessage } from './integrations/mail'
import { addLoanCard, getReaderIdentity } from './users'

/**
 * Circulación: solicitudes, préstamos, devoluciones, multas y reservas.
 * Cada operación valida permisos y reglas aquí, en el servidor, dentro de una
 * transacción. La interfaz solo refleja el resultado.
 *
 * El plazo de lectura lo elige el lector al pedir el libro y queda fijo: no hay
 * renovaciones y la base de datos rechaza cualquier cambio del plazo o de la fecha
 * de devolución (trigger `loans_term_locked`). Cada día de retraso genera una multa.
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
         (SELECT string_agg(a.name, '|' ORDER BY a.position) FROM book_authors a WHERE a.book_id = b.id) AS authors
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
  loan_days: number
  loan_card_number: string | null
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
    loanDays: r.loan_days,
    loanCardNumber: r.loan_card_number,
  }
}

export async function getLoan(loanId: number): Promise<LoanRecord | null> {
  const row = await get<LoanRow>(`${LOAN_SELECT} WHERE l.id = ?`, [loanId])
  return row ? toLoan(row) : null
}

export async function listUserLoans(userId: number): Promise<LoanRecord[]> {
  return (await all<LoanRow>(`${LOAN_SELECT} WHERE l.user_id = ? ORDER BY l.requested_at DESC, l.id DESC`, [userId])).map(
    toLoan,
  )
}

const RESERVATION_SELECT = `
  SELECT r.*, u.name AS user_name, u.email AS user_email,
         b.slug AS book_slug, b.title AS book_title, b.cover_key, b.cover_color,
         (SELECT string_agg(a.name, '|' ORDER BY a.position) FROM book_authors a WHERE a.book_id = b.id) AS authors,
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
  loan_days: number
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
    loanDays: r.loan_days,
  }
}

export async function listUserReservations(userId: number): Promise<ReservationRecord[]> {
  return (await all<ReservationRow>(`${RESERVATION_SELECT} WHERE r.user_id = ? ORDER BY r.created_at DESC`, [userId])).map(
    toReservation,
  )
}

/** Estado de un libro para un lector concreto: ¿lo tiene pedido, prestado o reservado? */
export async function getUserBookState(userId: number, bookId: number) {
  const loanRow = await get<LoanRow>(
    `${LOAN_SELECT} WHERE l.user_id = ? AND l.book_id = ? AND l.status IN ('pending','approved','checked_out')`,
    [userId, bookId],
  )
  const reservationRow = await get<ReservationRow>(
    `${RESERVATION_SELECT} WHERE r.user_id = ? AND r.book_id = ? AND r.status = 'waiting'`,
    [userId, bookId],
  )
  return {
    loan: loanRow ? toLoan(loanRow) : null,
    reservation: reservationRow ? toReservation(reservationRow) : null,
  }
}

/** Situación de los ejemplares de un libro (para el personal). */
export async function getBookCirculation(bookId: number) {
  const counts = Object.fromEntries(
    (await all<{ status: CopyStatus; n: number }>(
      'SELECT status, COUNT(*) AS n FROM copies WHERE book_id = ? GROUP BY status',
      [bookId],
    )).map((r) => [r.status, r.n]),
  ) as Partial<Record<CopyStatus, number>>
  const pending =
    (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE book_id = ? AND status = 'pending'`, [bookId]))?.n ?? 0
  const waiting =
    (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM reservations WHERE book_id = ? AND status = 'waiting'`, [bookId]))
      ?.n ?? 0
  return { copies: counts, pending, waiting }
}

/** Lector: ¿puede pedir libros ahora mismo? Devuelve el motivo si no. */
export async function getReaderEligibility(
  userId: number,
): Promise<{ canRequest: boolean; reason?: string; missingIdentity?: boolean }> {
  const user = await get<{ status: string }>('SELECT status FROM users WHERE id = ?', [userId])
  if (!user || user.status !== 'active') {
    return { canRequest: false, reason: 'Tu cuenta está suspendida. Escríbenos para revisarla.' }
  }
  if ((await pendingConsents(userId)).length) {
    return {
      canRequest: false,
      reason:
        'Para pedir libros necesitas aceptar la versión vigente de los términos y autorizar el tratamiento de tus datos. Puedes hacerlo en «Mis préstamos».',
    }
  }
  if (!(await getReaderIdentity(userId)).complete) {
    return {
      canRequest: false,
      reason:
        'Para pedir libros necesitamos tu teléfono, tu documento de identidad (CC o TI) y una tarjeta de crédito. Complétalos en «Mi perfil».',
      missingIdentity: true,
    }
  }
  if (await countOverdue(userId) > 0) {
    return { canRequest: false, reason: 'Tienes un préstamo vencido. Devuélvelo para poder pedir otro libro.' }
  }
  const owed = await pendingFineTotal(userId)
  if (owed > 0) {
    return {
      canRequest: false,
      reason: `Tienes multas pendientes por ${formatCOP(owed)}. Págalas en el mostrador para volver a pedir libros.`,
    }
  }
  if (await countActiveLoans(userId) >= LOAN_RULES.maxActiveLoans) {
    return {
      canRequest: false,
      reason: `Ya tienes ${LOAN_RULES.maxActiveLoans} libros pedidos o prestados, el máximo a la vez.`,
    }
  }
  return { canRequest: true }
}

/* ───────────────────────── Ayudas internas ───────────────────────── */

async function countOverdue(userId: number): Promise<number> {
  return (
    (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE user_id = ? AND status = 'checked_out' AND due_at < ?`, [
      userId,
      now(),
    ]))?.n ?? 0
  )
}

async function countActiveLoans(userId: number): Promise<number> {
  return (
    (await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM loans WHERE user_id = ? AND status IN ('pending','approved','checked_out')`,
      [userId],
    ))?.n ?? 0
  )
}

async function freeCopies(bookId: number): Promise<number> {
  const available =
    (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM copies WHERE book_id = ? AND status = 'available'`, [bookId]))?.n ?? 0
  const pending =
    (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE book_id = ? AND status = 'pending'`, [bookId]))?.n ?? 0
  return Math.max(0, available - pending)
}

async function pendingFineTotal(userId: number): Promise<number> {
  return (
    (await get<{ n: number }>(`SELECT COALESCE(SUM(amount), 0) AS n FROM fines WHERE user_id = ? AND status = 'pending'`, [userId]))
      ?.n ?? 0
  )
}

function pickupDeadline(): string {
  return endOfLibraryDay(addDays(new Date(), LOAN_RULES.pickupDays)).toISOString()
}

function dueDateFrom(base: Date, days: number): string {
  return endOfLibraryDay(addDays(base, days)).toISOString()
}

/** Lo que el lector confirma al pedir o reservar: el plazo de lectura y el carné. */
export interface LoanRequestOptions {
  /** Uno de LOAN_RULES.loanPeriods. Sin valor, el plazo por defecto. */
  loanDays?: number
  /** Un carné ya registrado en la cuenta… */
  cardId?: number
  /** …o un número escrito a mano (se registra en la cuenta si es nuevo). Sin ninguno, el carné principal. */
  cardNumber?: string
}

async function resolveRequestOptions(userId: number, options: LoanRequestOptions) {
  const loanDays = options.loanDays ?? LOAN_RULES.defaultLoanDays
  if (!isLoanPeriod(loanDays)) {
    throw new DomainError(`Elige un plazo de lectura de ${LOAN_RULES.loanPeriods.join(', ')} días.`, 'invalid_period', {
      loanDays: 'Elige uno de los plazos disponibles.',
    })
  }
  let card: { id: number; number: string } | undefined
  if (options.cardNumber?.trim()) {
    card = await addLoanCard(userId, options.cardNumber)
  } else if (options.cardId) {
    card = await get<{ id: number; number: string }>('SELECT id, number FROM loan_cards WHERE id = ? AND user_id = ?', [
      options.cardId,
      userId,
    ])
    if (!card) {
      throw new DomainError('Ese carné no está en tu cuenta. Elige otro o escribe el número.', 'invalid_card', {
        cardId: 'Elige uno de tus carnés.',
      })
    }
  } else {
    card = await get<{ id: number; number: string }>('SELECT id, number FROM loan_cards WHERE user_id = ? AND is_primary', [userId])
  }
  return { loanDays, card: card ?? null }
}

async function bookTitle(bookId: number): Promise<string> {
  return (await get<{ title: string }>('SELECT title FROM books WHERE id = ?', [bookId]))?.title ?? 'el libro'
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
async function releaseCopy(copyId: number, actorId: number | null, effects: Effect[]) {
  const copy = await get<{ id: number; book_id: number; code: string }>('SELECT id, book_id, code FROM copies WHERE id = ?', [
    copyId,
  ])
  if (!copy) return
  const queue = await all<{ id: number; user_id: number; created_at: string; loan_days: number; loan_card_id: number | null; card_number: string | null }>(
    `SELECT r.id, r.user_id, r.created_at, r.loan_days, r.loan_card_id, lc.number AS card_number
       FROM reservations r LEFT JOIN loan_cards lc ON lc.id = r.loan_card_id
      WHERE r.book_id = ? AND r.status = 'waiting' ORDER BY r.created_at, r.id`,
    [copy.book_id],
  )
  for (const reservation of queue) {
    const reader = await get<{ id: number; name: string; email: string; status: string }>(
      'SELECT id, name, email, status FROM users WHERE id = ?',
      [reservation.user_id],
    )
    const alreadyHasIt = await get<{ id: number }>(
      `SELECT id FROM loans WHERE user_id = ? AND book_id = ? AND status IN ('pending','approved','checked_out')`,
      [reservation.user_id, copy.book_id],
    )
    if (!reader || reader.status !== 'active' || alreadyHasIt) {
      await run(`UPDATE reservations SET status = 'cancelled', updated_at = ? WHERE id = ?`, [now(), reservation.id])
      continue
    }
    const deadline = pickupDeadline()
    // El plazo y el carné son los que el lector confirmó al reservar.
    const { lastInsertRowid: loanId } = await run(
      `INSERT INTO loans (user_id, book_id, copy_id, status, decided_at, decided_by, pickup_deadline,
                          loan_days, loan_card_id, loan_card_number)
       VALUES (?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?)`,
      [
        reader.id,
        copy.book_id,
        copy.id,
        now(),
        actorId,
        deadline,
        reservation.loan_days,
        reservation.loan_card_id,
        reservation.card_number,
      ],
    )
    await run(`UPDATE reservations SET status = 'fulfilled', loan_id = ?, updated_at = ? WHERE id = ?`, [
      loanId,
      now(),
      reservation.id,
    ])
    await run(`UPDATE copies SET status = 'reserved', updated_at = ? WHERE id = ?`, [now(), copy.id])
    const title = await bookTitle(copy.book_id)
    await logAudit({
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
  await run(`UPDATE copies SET status = 'available', updated_at = ? WHERE id = ?`, [now(), copy.id])
}

function runEffects(effects: Effect[]) {
  for (const effect of effects) effect()
}

async function loadLoanForUpdate(loanId: number) {
  const loan = await get<{
    id: number
    user_id: number
    book_id: number
    copy_id: number | null
    status: LoanStatus
    due_at: string | null
    loan_days: number
  }>('SELECT id, user_id, book_id, copy_id, status, due_at, loan_days FROM loans WHERE id = ?', [loanId])
  if (!loan) throw new DomainError('Ese préstamo ya no existe.', 'not_found')
  return loan
}

/* ───────────────────────── Lector ───────────────────────── */

/**
 * El lector confirma la solicitud con un plazo de lectura y un carné. Desde este momento
 * el plazo es definitivo: la fecha de devolución será la entrega + `loanDays` días.
 */
export async function requestLoan(
  userId: number,
  bookId: number,
  options: LoanRequestOptions = {},
): Promise<{ loanId: number; loanDays: number; cardNumber: string | null }> {
  return await transaction(async () => {
    const eligibility = await getReaderEligibility(userId)
    if (!eligibility.canRequest) throw new DomainError(eligibility.reason!, 'not_eligible')
    const book = await get<{ id: number; title: string }>(`SELECT id, title FROM books WHERE id = ? AND status = 'active'`, [
      bookId,
    ])
    if (!book) throw new DomainError('Este libro ya no está en el catálogo.', 'not_found')
    const existing = await get<{ id: number }>(
      `SELECT id FROM loans WHERE user_id = ? AND book_id = ? AND status IN ('pending','approved','checked_out')`,
      [userId, bookId],
    )
    if (existing) throw new DomainError('Ya tienes una solicitud o un préstamo de este libro.', 'duplicate')
    if ((await freeCopies(bookId)) <= 0) {
      throw new DomainError(
        'No quedan ejemplares libres. Puedes reservarlo y te avisaremos cuando vuelva uno.',
        'no_copies',
      )
    }
    const { loanDays, card } = await resolveRequestOptions(userId, options)
    await run(`UPDATE reservations SET status = 'cancelled', updated_at = ? WHERE user_id = ? AND book_id = ? AND status = 'waiting'`, [
      now(),
      userId,
      bookId,
    ])
    const { lastInsertRowid: loanId } = await run(
      `INSERT INTO loans (user_id, book_id, status, loan_days, loan_card_id, loan_card_number) VALUES (?, ?, 'pending', ?, ?, ?)`,
      [userId, bookId, loanDays, card?.id ?? null, card?.number ?? null],
    )
    await logAudit({
      actorId: userId,
      action: 'loan.requested',
      entityType: 'loan',
      entityId: loanId,
      summary: `Solicitó «${book.title}» por ${loanDays} días${card ? ` con el carné ${card.number}` : ''}`,
      details: { loanDays, card: card?.number ?? null },
    })
    return { loanId, loanDays, cardNumber: card?.number ?? null }
  })
}

export async function reserveBook(
  userId: number,
  bookId: number,
  options: LoanRequestOptions = {},
): Promise<{ reservationId: number; position: number }> {
  return await transaction(async () => {
    const user = await get<{ status: string }>('SELECT status FROM users WHERE id = ?', [userId])
    if (!user || user.status !== 'active') {
      throw new DomainError('Tu cuenta está suspendida. Escríbenos para revisarla.', 'not_eligible')
    }
    if ((await pendingConsents(userId)).length) {
      throw new DomainError('Acepta la versión vigente de los términos y la autorización de datos en «Mis préstamos» para reservar.', 'not_eligible')
    }
    // Una reserva se convierte sola en préstamo: exige lo mismo que pedirlo.
    if (!(await getReaderIdentity(userId)).complete) {
      throw new DomainError('Completa tu teléfono, documento y tarjeta en «Mi perfil» para reservar.', 'not_eligible')
    }
    const owed = await pendingFineTotal(userId)
    if (owed > 0) {
      throw new DomainError(`Tienes multas pendientes por ${formatCOP(owed)}. Págalas en el mostrador para reservar.`, 'not_eligible')
    }
    const book = await get<{ id: number; title: string }>(`SELECT id, title FROM books WHERE id = ? AND status = 'active'`, [
      bookId,
    ])
    if (!book) throw new DomainError('Este libro ya no está en el catálogo.', 'not_found')
    const total =
      (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM copies WHERE book_id = ? AND status NOT IN ('lost','withdrawn')`, [
        bookId,
      ]))?.n ?? 0
    if (total === 0) {
      throw new DomainError('Este título todavía no tiene ejemplares en la biblioteca, así que no se puede reservar.', 'no_copies')
    }
    if ((await freeCopies(bookId)) > 0) {
      throw new DomainError('Hay ejemplares libres: solicita el préstamo directamente.', 'copies_available')
    }
    const hasLoan = await get<{ id: number }>(
      `SELECT id FROM loans WHERE user_id = ? AND book_id = ? AND status IN ('pending','approved','checked_out')`,
      [userId, bookId],
    )
    if (hasLoan) throw new DomainError('Ya tienes este libro pedido o prestado.', 'duplicate')
    const waiting = await get<{ id: number }>(
      `SELECT id FROM reservations WHERE user_id = ? AND book_id = ? AND status = 'waiting'`,
      [userId, bookId],
    )
    if (waiting) throw new DomainError('Ya estás en la lista de espera de este libro.', 'duplicate')
    const myWaiting =
      (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM reservations WHERE user_id = ? AND status = 'waiting'`, [userId]))
        ?.n ?? 0
    if (myWaiting >= LOAN_RULES.maxActiveReservations) {
      throw new DomainError(
        `Ya tienes ${LOAN_RULES.maxActiveReservations} reservas en espera, el máximo a la vez.`,
        'limit',
      )
    }
    const { loanDays, card } = await resolveRequestOptions(userId, options)
    const { lastInsertRowid: reservationId } = await run(
      'INSERT INTO reservations (user_id, book_id, loan_days, loan_card_id) VALUES (?, ?, ?, ?)',
      [userId, bookId, loanDays, card?.id ?? null],
    )
    const position =
      (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM reservations WHERE book_id = ? AND status = 'waiting'`, [bookId]))
        ?.n ?? 1
    await logAudit({
      actorId: userId,
      action: 'reservation.created',
      entityType: 'reservation',
      entityId: reservationId,
      summary: `Reservó «${book.title}» (puesto ${position} en la cola)`,
    })
    return { reservationId, position }
  })
}

export async function cancelReservation(actor: Actor, reservationId: number) {
  await transaction(async () => {
    const reservation = await get<{ id: number; user_id: number; book_id: number; status: string }>(
      'SELECT id, user_id, book_id, status FROM reservations WHERE id = ?',
      [reservationId],
    )
    if (!reservation) throw new DomainError('Esa reserva ya no existe.', 'not_found')
    if (!actor.isStaff && reservation.user_id !== actor.id) {
      throw new DomainError('No puedes cancelar la reserva de otra persona.', 'forbidden')
    }
    if (reservation.status !== 'waiting') throw new DomainError('La reserva ya no está en espera.', 'invalid_state')
    await run(`UPDATE reservations SET status = 'cancelled', updated_at = ? WHERE id = ?`, [now(), reservationId])
    await logAudit({
      actorId: actor.id,
      action: 'reservation.cancelled',
      entityType: 'reservation',
      entityId: reservationId,
      summary: `Canceló la reserva de «${await bookTitle(reservation.book_id)}»`,
    })
  })
}

export async function cancelLoan(actor: Actor, loanId: number) {
  const effects: Effect[] = []
  await transaction(async () => {
    const loan = await loadLoanForUpdate(loanId)
    if (!actor.isStaff && loan.user_id !== actor.id) {
      throw new DomainError('No puedes cancelar la solicitud de otra persona.', 'forbidden')
    }
    if (loan.status !== 'pending' && loan.status !== 'approved') {
      throw new DomainError('Solo se pueden cancelar solicitudes pendientes o ejemplares por recoger.', 'invalid_state')
    }
    await run(`UPDATE loans SET status = 'cancelled', updated_at = ? WHERE id = ?`, [now(), loanId])
    if (loan.status === 'approved' && loan.copy_id) await releaseCopy(loan.copy_id, actor.id, effects)
    await logAudit({
      actorId: actor.id,
      action: 'loan.cancelled',
      entityType: 'loan',
      entityId: loanId,
      summary: `Canceló la solicitud de «${await bookTitle(loan.book_id)}»`,
    })
  })
  runEffects(effects)
}

/* ───────────────────────── Personal de biblioteca ───────────────────────── */

async function assignCopy(
  loan: { id: number; book_id: number },
  staffId: number,
  copyId?: number,
): Promise<{ copyId: number; deadline: string }> {
  const copy = copyId
    ? await get<{ id: number; book_id: number; status: CopyStatus }>('SELECT id, book_id, status FROM copies WHERE id = ?', [
        copyId,
      ])
    : await get<{ id: number; book_id: number; status: CopyStatus }>(
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
  await run(`UPDATE copies SET status = 'reserved', updated_at = ? WHERE id = ?`, [now(), copy.id])
  await run(
    `UPDATE loans SET status = 'approved', copy_id = ?, decided_at = ?, decided_by = ?, pickup_deadline = ?, updated_at = ?
      WHERE id = ?`,
    [copy.id, now(), staffId, deadline, now(), loan.id],
  )
  return { copyId: copy.id, deadline }
}

export async function approveLoan(staffId: number, loanId: number, copyId?: number) {
  const effects: Effect[] = []
  await transaction(async () => {
    const loan = await loadLoanForUpdate(loanId)
    if (loan.status !== 'pending') throw new DomainError('Solo se pueden aprobar solicitudes pendientes.', 'invalid_state')
    const { deadline } = await assignCopy(loan, staffId, copyId)
    const reader = (await get<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [loan.user_id]))!
    const title = await bookTitle(loan.book_id)
    await logAudit({
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

export async function rejectLoan(staffId: number, loanId: number, reason: string) {
  const effects: Effect[] = []
  const cleanReason = reason.trim()
  if (cleanReason.length < 5) {
    throw new DomainError('Explica el motivo del rechazo (al menos 5 caracteres).', 'reason_required', {
      reason: 'Escribe el motivo.',
    })
  }
  await transaction(async () => {
    const loan = await loadLoanForUpdate(loanId)
    if (loan.status !== 'pending' && loan.status !== 'approved') {
      throw new DomainError('Solo se pueden rechazar solicitudes pendientes o por recoger.', 'invalid_state')
    }
    await run(
      `UPDATE loans SET status = 'rejected', rejection_reason = ?, decided_at = ?, decided_by = ?, updated_at = ? WHERE id = ?`,
      [cleanReason.slice(0, 300), now(), staffId, now(), loanId],
    )
    if (loan.status === 'approved' && loan.copy_id) await releaseCopy(loan.copy_id, staffId, effects)
    const reader = (await get<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [loan.user_id]))!
    const title = await bookTitle(loan.book_id)
    await logAudit({
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
export async function checkoutLoan(staffId: number, loanId: number): Promise<{ dueAt: string }> {
  return await transaction(async () => {
    const loan = await loadLoanForUpdate(loanId)
    let copyId = loan.copy_id
    if (loan.status === 'pending') {
      copyId = (await assignCopy(loan, staffId)).copyId
    } else if (loan.status !== 'approved') {
      throw new DomainError('Solo se pueden entregar solicitudes pendientes o ejemplares apartados.', 'invalid_state')
    }
    if (!copyId) throw new DomainError('La solicitud no tiene un ejemplar asignado.', 'invalid_state')
    // El plazo es el que el lector confirmó; a partir de aquí la fecha queda bloqueada.
    const dueAt = dueDateFrom(new Date(), loan.loan_days)
    await run(`UPDATE copies SET status = 'on_loan', updated_at = ? WHERE id = ?`, [now(), copyId])
    await run(
      `UPDATE loans SET status = 'checked_out', checked_out_at = ?, checked_out_by = ?, due_at = ?, updated_at = ?
        WHERE id = ?`,
      [now(), staffId, dueAt, now(), loanId],
    )
    const code = (await get<{ code: string }>('SELECT code FROM copies WHERE id = ?', [copyId]))?.code
    await logAudit({
      actorId: staffId,
      action: 'loan.checked_out',
      entityType: 'loan',
      entityId: loanId,
      summary: `Entregó el ejemplar ${code} de «${await bookTitle(loan.book_id)}» por ${loan.loan_days} días (devolución: ${formatDate(dueAt)})`,
    })
    return { dueAt }
  })
}

/**
 * Devolución en el mostrador. Si llega tarde, se genera la multa por mora en la misma
 * transacción: días naturales de retraso × tarifa diaria vigente.
 */
export async function returnLoan(
  staffId: number,
  loanId: number,
  options: { toMaintenance?: boolean } = {},
): Promise<{ fine: { days: number; amount: number } | null }> {
  const effects: Effect[] = []
  const result = await transaction(async () => {
    const loan = await loadLoanForUpdate(loanId)
    if (loan.status !== 'checked_out') throw new DomainError('Ese libro no figura como prestado.', 'invalid_state')
    const returnedAt = now()
    await run(`UPDATE loans SET status = 'returned', returned_at = ?, returned_by = ?, updated_at = ? WHERE id = ?`, [
      returnedAt,
      staffId,
      returnedAt,
      loanId,
    ])
    const late = loan.due_at ? accruedFine(loan.due_at, returnedAt) : { days: 0, amount: 0 }
    const title = await bookTitle(loan.book_id)
    if (late.days > 0) {
      const { lastInsertRowid: fineId } = await run(
        `INSERT INTO fines (loan_id, user_id, days_late, daily_rate, amount, is_demo)
         SELECT ?, ?, ?, ?, ?, is_demo FROM loans WHERE id = ?`,
        [loanId, loan.user_id, late.days, FINE_RULES.dailyFine, late.amount, loanId],
      )
      await logAudit({
        actorId: staffId,
        action: 'fine.created',
        entityType: 'fine',
        entityId: fineId,
        summary: `Multa de ${formatCOP(late.amount)} por ${describeLate(late.days)} en «${title}»`,
        details: { loanId, days: late.days, dailyRate: FINE_RULES.dailyFine },
      })
      const reader = (await get<{ name: string; email: string }>('SELECT name, email FROM users WHERE id = ?', [loan.user_id]))!
      effects.push(() => sendInBackground(fineMail(reader.email, reader.name, title, late.days, late.amount)))
    }
    if (loan.copy_id) {
      if (options.toMaintenance) {
        await run(`UPDATE copies SET status = 'maintenance', updated_at = ? WHERE id = ?`, [now(), loan.copy_id])
      } else {
        await releaseCopy(loan.copy_id, staffId, effects)
      }
    }
    await logAudit({
      actorId: staffId,
      action: 'loan.returned',
      entityType: 'loan',
      entityId: loanId,
      summary: `Registró la devolución de «${title}»${options.toMaintenance ? ' (a reparación)' : ''}`,
    })
    return { fine: late.days > 0 ? late : null }
  })
  runEffects(effects)
  return result
}

function fineMail(to: string, name: string, title: string, days: number, amount: number): MailMessage {
  return {
    to,
    subject: `Multa por devolución tardía: ${title}`,
    text: [
      `Hola, ${name}:`,
      '',
      `Registramos la devolución de «${title}» con ${describeLate(days)}.`,
      `Multa: ${days} × ${formatCOP(FINE_RULES.dailyFine)} = ${formatCOP(amount)}.`,
      'Puedes pagarla en el mostrador. Mientras esté pendiente no podrás pedir otros libros.',
      '',
      `Consulta el detalle en ${env().APP_URL}/cuenta`,
      '',
      'Biblioteca Gota Gota',
    ].join('\n'),
  }
}

/* ───────────────────────── Multas ───────────────────────── */

const FINE_SELECT = `
  SELECT f.*, u.name AS user_name, u.card_number AS user_card, b.title AS book_title, b.slug AS book_slug,
         l.due_at, l.returned_at
    FROM fines f
    JOIN loans l ON l.id = f.loan_id
    JOIN users u ON u.id = f.user_id
    JOIN books b ON b.id = l.book_id`

interface FineRow {
  id: number
  loan_id: number
  user_id: number
  days_late: number
  daily_rate: number
  amount: number
  status: FineStatus
  created_at: string
  settled_at: string | null
  settle_note: string | null
  user_name: string
  user_card: string
  book_title: string
  book_slug: string
  due_at: string
  returned_at: string
}

function toFine(r: FineRow): FineRecord {
  return {
    id: r.id,
    loanId: r.loan_id,
    userId: r.user_id,
    userName: r.user_name,
    userCardNumber: r.user_card,
    bookTitle: r.book_title,
    bookSlug: r.book_slug,
    dueAt: r.due_at,
    returnedAt: r.returned_at,
    daysLate: r.days_late,
    dailyRate: r.daily_rate,
    amount: r.amount,
    status: r.status,
    createdAt: r.created_at,
    settledAt: r.settled_at,
    settleNote: r.settle_note,
  }
}

export async function listUserFines(userId: number): Promise<FineRecord[]> {
  return (await all<FineRow>(`${FINE_SELECT} WHERE f.user_id = ? ORDER BY f.created_at DESC, f.id DESC`, [userId])).map(toFine)
}

/**
 * Resumen de atrasos de un lector: multas ya generadas (pendientes) y lo que van
 * sumando los préstamos vencidos que todavía no ha devuelto.
 */
export async function getUserFineSummary(userId: number, at = new Date()) {
  const pending = await pendingFineTotal(userId)
  const overdue = await all<{ id: number; due_at: string }>(
    `SELECT id, due_at FROM loans WHERE user_id = ? AND status = 'checked_out' AND due_at < ?`,
    [userId, at.toISOString()],
  )
  const accruing = overdue.reduce((sum, loan) => sum + accruedFine(loan.due_at, at).amount, 0)
  return { pending, accruing, total: pending + accruing, overdueLoans: overdue.length }
}

export type StaffFineView = 'pending' | 'settled'

export async function listStaffFines(options: { view: StaffFineView; q?: string; page: number; pageSize: number }) {
  const params: Record<string, SqlValue> = {}
  const where = [options.view === 'pending' ? `f.status = 'pending'` : `f.status IN ('paid','waived')`]
  if (options.q?.trim()) {
    where.push('(u.name LIKE :q OR u.email LIKE :q OR u.card_number LIKE :q OR b.title LIKE :q)')
    params.q = `%${options.q.trim()}%`
  }
  const clause = `WHERE ${where.join(' AND ')}`
  const from = `FROM fines f JOIN loans l ON l.id = f.loan_id JOIN users u ON u.id = f.user_id JOIN books b ON b.id = l.book_id`
  const totals = await get<{ n: number; amount: number }>(`SELECT COUNT(*) AS n, COALESCE(SUM(f.amount), 0) AS amount ${from} ${clause}`, params)
  const fines = (await all<FineRow>(
    `${FINE_SELECT} ${clause} ORDER BY ${options.view === 'pending' ? 'f.created_at ASC' : 'f.settled_at DESC'}, f.id DESC
      LIMIT :limit OFFSET :offset`,
    { ...params, limit: options.pageSize, offset: (options.page - 1) * options.pageSize },
  )).map(toFine)
  return { fines, total: totals?.n ?? 0, amount: totals?.amount ?? 0 }
}

/** El personal registra el pago en el mostrador o condona la multa explicando el motivo. */
export async function settleFine(staffId: number, fineId: number, outcome: 'paid' | 'waived', note?: string) {
  const cleanNote = note?.trim().slice(0, 300) || null
  if (outcome === 'waived' && (!cleanNote || cleanNote.length < 5)) {
    throw new DomainError('Explica por qué se condona la multa (al menos 5 caracteres).', 'reason_required', {
      reason: 'Escribe el motivo.',
    })
  }
  await transaction(async () => {
    const fine = await get<FineRow>(`${FINE_SELECT} WHERE f.id = ?`, [fineId])
    if (!fine) throw new DomainError('Esa multa ya no existe.', 'not_found')
    if (fine.status !== 'pending') throw new DomainError('Esa multa ya está saldada.', 'invalid_state')
    await run(`UPDATE fines SET status = ?, settled_at = ?, settled_by = ?, settle_note = ? WHERE id = ?`, [
      outcome,
      now(),
      staffId,
      cleanNote,
      fineId,
    ])
    await logAudit({
      actorId: staffId,
      action: outcome === 'paid' ? 'fine.paid' : 'fine.waived',
      entityType: 'fine',
      entityId: fineId,
      summary: `${outcome === 'paid' ? 'Registró el pago de' : 'Condonó'} la multa de ${formatCOP(fine.amount)} de ${fine.user_name} («${fine.book_title}»)`,
      details: cleanNote ? { note: cleanNote } : undefined,
    })
  })
}

/** Caduca los apartados que nadie recogió a tiempo y devuelve los ejemplares a la cola. */
export async function expireStalePickups(): Promise<number> {
  const stale = await all<{ id: number; copy_id: number | null; book_id: number }>(
    `SELECT id, copy_id, book_id FROM loans WHERE status = 'approved' AND pickup_deadline < ?`,
    [now()],
  )
  if (stale.length === 0) return 0
  const effects: Effect[] = []
  await transaction(async () => {
    for (const loan of stale) {
      await run(`UPDATE loans SET status = 'expired', updated_at = ? WHERE id = ? AND status = 'approved'`, [now(), loan.id])
      if (loan.copy_id) await releaseCopy(loan.copy_id, null, effects)
      await logAudit({
        actorId: null,
        action: 'loan.expired',
        entityType: 'loan',
        entityId: loan.id,
        summary: `Venció el plazo para recoger «${await bookTitle(loan.book_id)}»`,
      })
    }
  })
  runEffects(effects)
  return stale.length
}

export async function addCopies(
  staffId: number,
  bookId: number,
  count: number,
  options: { location?: string | null; condition?: CopyCondition },
) {
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new DomainError('Indica entre 1 y 50 ejemplares.', 'invalid_count', { count: 'Entre 1 y 50.' })
  }
  const effects: Effect[] = []
  await transaction(async () => {
    const book = await get<{ title: string; status: string }>('SELECT title, status FROM books WHERE id = ?', [bookId])
    if (!book) throw new DomainError('La ficha ya no existe.', 'not_found')
    const ids = await insertCopies(bookId, count, options)
    for (const id of ids) await releaseCopy(id, staffId, effects)
    await logAudit({
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

export async function setCopyStatus(staffId: number, copyId: number, status: CopyStatus) {
  if (!MANUAL_COPY_STATUSES.includes(status)) {
    throw new DomainError('Ese estado lo asigna el sistema al prestar o apartar.', 'invalid_status')
  }
  const effects: Effect[] = []
  await transaction(async () => {
    const copy = await getCopy(copyId)
    if (!copy) throw new DomainError('El ejemplar ya no existe.', 'not_found')
    if (copy.status === 'reserved' || copy.status === 'on_loan') {
      throw new DomainError(
        'Este ejemplar está en un préstamo en curso. Cierra el préstamo antes de cambiar su estado.',
        'in_circulation',
      )
    }
    if (copy.status === status) return
    if (status === 'available') {
      await releaseCopy(copyId, staffId, effects)
    } else {
      await run('UPDATE copies SET status = ?, updated_at = ? WHERE id = ?', [status, now(), copyId])
    }
    await logAudit({
      actorId: staffId,
      action: 'copy.status_changed',
      entityType: 'copy',
      entityId: copyId,
      summary: `Cambió el ejemplar ${copy.code} de «${await bookTitle(copy.bookId)}» a «${status}»`,
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

export async function listStaffLoans(options: { view: StaffLoanView; q?: string; page: number; pageSize: number }) {
  const filter = VIEW_FILTER[options.view]
  const params: Record<string, SqlValue> = {}
  const where = [filter.where]
  if (filter.where.includes(':now')) params.now = now()
  if (options.q?.trim()) {
    where.push(`(u.name LIKE :q OR u.email LIKE :q OR u.card_number LIKE :q OR b.title LIKE :q OR c.code LIKE :q)`)
    params.q = `%${options.q.trim()}%`
  }
  const clause = `WHERE ${where.join(' AND ')}`
  const total =
    (await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM loans l JOIN users u ON u.id = l.user_id JOIN books b ON b.id = l.book_id
         LEFT JOIN copies c ON c.id = l.copy_id ${clause}`,
      params,
    ))?.n ?? 0
  const loans = (await all<LoanRow>(`${LOAN_SELECT} ${clause} ORDER BY ${filter.order} LIMIT :limit OFFSET :offset`, {
    ...params,
    limit: options.pageSize,
    offset: (options.page - 1) * options.pageSize,
  })).map(toLoan)
  return { loans, total }
}

export async function countStaffLoanViews(): Promise<Record<StaffLoanView | 'reservations' | 'fines', number>> {
  const n = now()
  const count = async (sql: string, params: SqlValue[] = []) => (await get<{ n: number }>(sql, params))?.n ?? 0
  const [requests, pickup, active, overdue, history, reservations, fines] = await Promise.all([
    count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'pending'`),
    count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'approved'`),
    count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'checked_out' AND due_at >= ?`, [n]),
    count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'checked_out' AND due_at < ?`, [n]),
    count(`SELECT COUNT(*) AS n FROM loans WHERE status IN ('returned','rejected','cancelled','expired')`),
    count(`SELECT COUNT(*) AS n FROM reservations WHERE status = 'waiting'`),
    count(`SELECT COUNT(*) AS n FROM fines WHERE status = 'pending'`),
  ])
  return {
    requests,
    pickup,
    active,
    overdue,
    history,
    reservations,
    fines,
  }
}

export async function listWaitingReservations(options: { q?: string; page: number; pageSize: number }) {
  const params: Record<string, SqlValue> = {}
  const where = [`r.status = 'waiting'`]
  if (options.q?.trim()) {
    where.push('(u.name LIKE :q OR u.email LIKE :q OR b.title LIKE :q)')
    params.q = `%${options.q.trim()}%`
  }
  const clause = `WHERE ${where.join(' AND ')}`
  const total =
    (await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM reservations r JOIN users u ON u.id = r.user_id JOIN books b ON b.id = r.book_id ${clause}`,
      params,
    ))?.n ?? 0
  const reservations = (await all<ReservationRow>(
    `${RESERVATION_SELECT} ${clause} ORDER BY b.title, r.created_at LIMIT :limit OFFSET :offset`,
    { ...params, limit: options.pageSize, offset: (options.page - 1) * options.pageSize },
  )).map(toReservation)
  return { reservations, total }
}

export async function countWaitingReservations(bookId: number): Promise<number> {
  return (
    (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM reservations WHERE book_id = ? AND status = 'waiting'`, [bookId]))?.n ?? 0
  )
}

/** Préstamos efectivamente entregados: decide si ordenar por popularidad tiene sentido. */
export async function countCirculatedLoans(): Promise<number> {
  return (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM loans WHERE status IN ('checked_out','returned')`))?.n ?? 0
}

export async function getDashboardStats() {
  const n = now()
  const count = async (sql: string, params: SqlValue[] = []) => (await get<{ n: number }>(sql, params))?.n ?? 0
  const [
    books,
    copiesTotal,
    copiesAvailable,
    activeLoans,
    pendingRequests,
    pickups,
    overdue,
    waitingReservations,
    readers,
    pendingFines,
  ] = await Promise.all([
    count(`SELECT COUNT(*) AS n FROM books WHERE status = 'active'`),
    count(`SELECT COUNT(*) AS n FROM copies WHERE status NOT IN ('lost','withdrawn')`),
    count(`SELECT COUNT(*) AS n FROM copies WHERE status = 'available'`),
    count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'checked_out'`),
    count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'pending'`),
    count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'approved'`),
    count(`SELECT COUNT(*) AS n FROM loans WHERE status = 'checked_out' AND due_at < ?`, [n]),
    count(`SELECT COUNT(*) AS n FROM reservations WHERE status = 'waiting'`),
    count(`SELECT COUNT(*) AS n FROM users WHERE role = 'reader' AND status = 'active'`),
    count(`SELECT COALESCE(SUM(amount), 0) AS n FROM fines WHERE status = 'pending'`),
  ])
  return {
    pendingFines,
    books,
    copiesTotal,
    copiesAvailable,
    activeLoans,
    pendingRequests,
    pickups,
    overdue,
    waitingReservations,
    readers,
  }
}
