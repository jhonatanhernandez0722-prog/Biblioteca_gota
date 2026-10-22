import { BookmarkPlus, CalendarClock, CircleAlert, HandHelping, Lock } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { cancelLoanAction, cancelReservationAction } from '@/actions/reader'
import { DropMark } from '@/components/brand/DropMark'
import { BookCover } from '@/components/books/BookCover'
import { ConfirmAction } from '@/components/ui/ConfirmAction'
import { describeDue, formatDate, formatShortDate } from '@/lib/dates'
import { accruedFine, describeLate, formatCOP } from '@/lib/fines'
import { FINE_RULES } from '@/lib/rules'
import { FINE_STATUS, LOAN_STATUS, loanDisplayStatus } from '@/lib/status'
import { joinAuthors } from '@/lib/text'
import type { LoanRecord } from '@/lib/types'
import { requireUser } from '@/server/auth/current-user'
import {
  expireStalePickups,
  getReaderEligibility,
  getUserFineSummary,
  listUserFines,
  listUserLoans,
  listUserReservations,
} from '@/server/circulation'
import { AcceptPendingForm } from '@/components/legal/ConsentForms'
import { pendingConsents } from '@/server/consents'
import styles from './cuenta.module.css'

export const metadata: Metadata = { title: 'Mis préstamos' }

function LoanBook({ loan }: { loan: LoanRecord }) {
  return (
    <div className={styles.book}>
      <BookCover
        title={loan.bookTitle}
        authors={loan.bookAuthors}
        coverKey={loan.coverKey}
        coverColor={loan.coverColor}
        sizes="72px"
        className={styles.bookCover}
      />
      <div>
        <h3 className={styles.bookTitle}>
          <Link href={`/libros/${loan.bookSlug}`}>{loan.bookTitle}</Link>
        </h3>
        <p className={styles.bookAuthor}>{joinAuthors(loan.bookAuthors)}</p>
        {loan.copyCode ? <p className="meta">Ejemplar {loan.copyCode}</p> : null}
      </div>
    </div>
  )
}

export default async function AccountPage() {
  const user = await requireUser('/cuenta')
  await expireStalePickups()
  const loans = await listUserLoans(user.id)
  const reservations = (await listUserReservations(user.id)).filter((r) => r.status === 'waiting')
  const eligibility = await getReaderEligibility(user.id)
  const pendingDocs = await pendingConsents(user.id)

  const fines = await listUserFines(user.id)
  const fineSummary = await getUserFineSummary(user.id)

  const onLoan = loans.filter((l) => l.status === 'checked_out')
  const overdueLoans = onLoan.filter((l) => loanDisplayStatus(l.status, l.dueAt) === 'overdue')
  const pendingFines = fines.filter((f) => f.status === 'pending')
  const settledFines = fines.filter((f) => f.status !== 'pending')
  const ready = loans.filter((l) => l.status === 'approved')
  const pending = loans.filter((l) => l.status === 'pending')
  const history = loans.filter((l) => ['returned', 'rejected', 'cancelled', 'expired'].includes(l.status))
  const firstName = user.name.split(' ')[0]
  const nothing = loans.length === 0 && reservations.length === 0

  return (
    <div className="container">
      <header className={styles.head}>
        <div className={styles.headText}>
          <h1>Hola, {firstName}</h1>
          <p className={styles.lead}>
            {onLoan.length
              ? `Tienes ${onLoan.length} ${onLoan.length === 1 ? 'libro' : 'libros'} en préstamo.`
              : 'Aquí verás tus préstamos, solicitudes y reservas.'}{' '}
            <Link href="/cuenta/perfil" className="link">
              Editar mi perfil
            </Link>
          </p>
        </div>
        <div className={styles.card} aria-label="Tu carné de lector">
          <DropMark size={34} spine="var(--ink)" ink="var(--paper)" />
          <div>
            <p className={styles.cardLabel}>Carné de lector</p>
            <p className={styles.cardNumber}>{user.cardNumber}</p>
          </div>
        </div>
      </header>

      {pendingDocs.length ? (
        <section className={styles.panel} aria-labelledby="aceptaciones" style={{ marginBottom: 32 }}>
          <h2 id="aceptaciones" className={styles.panelTitle}>
            Antes de pedir libros
          </h2>
          <p>
            {pendingDocs.length === 2
              ? 'Necesitamos que aceptes los términos y autorices el tratamiento de tus datos en su versión vigente.'
              : pendingDocs[0] === 'terminos'
                ? 'Los términos cambiaron: revisa y acepta la versión vigente.'
                : 'Necesitamos tu autorización vigente para tratar tus datos.'}{' '}
            Mientras tanto puedes consultar el catálogo y tu historial.
          </p>
          <AcceptPendingForm pending={pendingDocs} />
        </section>
      ) : null}

      {!eligibility.canRequest && !pendingDocs.length ? (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: 32 }}>
          <CircleAlert aria-hidden="true" />
          <p>
            {eligibility.reason}
            {eligibility.missingIdentity ? (
              <>
                {' '}
                <Link href="/cuenta/perfil#datos-prestamo" className="link">
                  Completar mis datos
                </Link>
              </>
            ) : null}
          </p>
        </div>
      ) : null}

      {overdueLoans.length || pendingFines.length ? (
        <section className={styles.section} aria-labelledby="multas">
          <h2 id="multas" className={styles.sectionTitle}>
            Atrasos y multas
          </h2>
          <div className={styles.fines}>
            <div className={styles.finesTotals}>
              <div className={`${styles.fineStat} ${styles.fineStatStrong}`}>
                <span className={styles.fineStatLabel}>Total a hoy</span>
                <span className={styles.fineStatValue}>{formatCOP(fineSummary.total)}</span>
                <span className={styles.fineStatHint}>
                  {fineSummary.accruing
                    ? `Sube ${formatCOP(FINE_RULES.dailyFine * fineSummary.overdueLoans)} cada día hasta que ${
                        fineSummary.overdueLoans === 1 ? 'devuelvas el libro' : 'devuelvas los libros'
                      }.`
                    : 'Se paga en el mostrador.'}
                </span>
              </div>
              {/* El desglose solo aporta cuando hay de los dos tipos. */}
              {fineSummary.pending && fineSummary.accruing ? (
                <>
                  <div className={styles.fineStat}>
                    <span className={styles.fineStatLabel}>Multas por pagar</span>
                    <span className={styles.fineStatValue}>{formatCOP(fineSummary.pending)}</span>
                    <span className={styles.fineStatHint}>De libros ya devueltos.</span>
                  </div>
                  <div className={styles.fineStat}>
                    <span className={styles.fineStatLabel}>De libros sin devolver</span>
                    <span className={styles.fineStatValue}>{formatCOP(fineSummary.accruing)}</span>
                    <span className={styles.fineStatHint}>Sigue sumando cada día.</span>
                  </div>
                </>
              ) : null}
            </div>
            <div className="table-wrap">
              <table className="table">
                <caption className="visually-hidden">Préstamos vencidos y multas pendientes</caption>
                <thead>
                  <tr>
                    <th scope="col">Libro</th>
                    <th scope="col">Debía volver</th>
                    <th scope="col">Retraso</th>
                    <th scope="col" className="num">
                      Multa
                    </th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueLoans.map((loan) => {
                    const fine = accruedFine(loan.dueAt!)
                    return (
                      <tr key={`l${loan.id}`}>
                        <td>
                          <Link href={`/libros/${loan.bookSlug}`} className="link">
                            {loan.bookTitle}
                          </Link>
                        </td>
                        <td>{formatShortDate(loan.dueAt!)}</td>
                        <td>{describeLate(fine.days)}</td>
                        <td className="num">
                          <span className={styles.formula}>
                            {fine.days} × {formatCOP(FINE_RULES.dailyFine)} = <strong>{formatCOP(fine.amount)}</strong>
                          </span>
                        </td>
                        <td>
                          <span className="badge badge--danger">Sin devolver · sigue sumando</span>
                        </td>
                      </tr>
                    )
                  })}
                  {pendingFines.map((fine) => (
                    <tr key={`f${fine.id}`}>
                      <td>
                        <Link href={`/libros/${fine.bookSlug}`} className="link">
                          {fine.bookTitle}
                        </Link>
                      </td>
                      <td>{formatShortDate(fine.dueAt)}</td>
                      <td>
                        {describeLate(fine.daysLate)}
                        <span className="meta" style={{ display: 'block' }}>
                          Devuelto el {formatShortDate(fine.returnedAt)}
                        </span>
                      </td>
                      <td className="num">
                        <span className={styles.formula}>
                          {fine.daysLate} × {formatCOP(fine.dailyRate)} = <strong>{formatCOP(fine.amount)}</strong>
                        </span>
                      </td>
                      <td>
                        <span className={`badge badge--${FINE_STATUS.pending.tone}`}>{FINE_STATUS.pending.label}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="meta">
              Cada día natural de retraso suma {formatCOP(FINE_RULES.dailyFine)}. Mientras tengas un préstamo vencido o una
              multa pendiente no podrás pedir ni reservar libros. ¿Crees que hay un error?{' '}
              <Link href="/reembolsos" className="link">
                Cómo reclamar una multa
              </Link>
              .
            </p>
          </div>
        </section>
      ) : null}

      {nothing ? (
        <div className="empty">
          <h2>Aún no has pedido libros</h2>
          <p>Busca algo que te apetezca leer: si está en la estantería, lo pides con un botón y pasas a recogerlo.</p>
          <Link href="/explorar" className="btn">
            Explorar el catálogo
          </Link>
        </div>
      ) : null}

      {onLoan.length ? (
        <section className={styles.section} aria-labelledby="en-prestamo">
          <h2 id="en-prestamo" className={styles.sectionTitle}>
            En tus manos
          </h2>
          <ul role="list" className={styles.slips}>
            {onLoan.map((loan) => {
              const display = loanDisplayStatus(loan.status, loan.dueAt)
              const overdue = display === 'overdue'
              const fine = accruedFine(loan.dueAt!)
              return (
                <li key={loan.id} className={`${styles.slip} ${overdue ? styles.slipOverdue : ''}`}>
                  <LoanBook loan={loan} />
                  <div className={styles.due}>
                    <p className={styles.dueLabel}>{overdue ? 'Debías devolverlo el' : 'Devuélvelo antes del'}</p>
                    <p className={styles.dueDate}>{formatShortDate(loan.dueAt!)}</p>
                    <p className={styles.dueRelative}>
                      {overdue ? <CircleAlert aria-hidden="true" /> : <CalendarClock aria-hidden="true" />}
                      {describeDue(loan.dueAt!)}
                    </p>
                  </div>
                  <div className={styles.slipActions}>
                    <span className={styles.term}>
                      <Lock aria-hidden="true" />
                      Plazo fijo de {loan.loanDays} días
                    </span>
                    {overdue ? (
                      <>
                        <span className={styles.fineAccrued}>Multa: {formatCOP(fine.amount)}</span>
                        <p className="meta">Sube {formatCOP(FINE_RULES.dailyFine)} cada día. Devuélvelo en el mostrador.</p>
                      </>
                    ) : (
                      <p className="meta">
                        {loan.loanCardNumber ? `Carné ${loan.loanCardNumber}. ` : ''}
                        Cada día de retraso suma {formatCOP(FINE_RULES.dailyFine)}.
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {ready.length ? (
        <section className={styles.section} aria-labelledby="para-recoger">
          <h2 id="para-recoger" className={styles.sectionTitle}>
            Listos para recoger
          </h2>
          <ul role="list" className={styles.rows}>
            {ready.map((loan) => (
              <li key={loan.id} className={styles.row}>
                <LoanBook loan={loan} />
                <p className={styles.rowStatus}>
                  <HandHelping aria-hidden="true" />
                  Apartado hasta el {formatDate(loan.pickupDeadline!)}. Recógelo con el carné{' '}
                  {loan.loanCardNumber ?? user.cardNumber}; lo tendrás {loan.loanDays} días.
                </p>
                <ConfirmAction
                  action={cancelLoanAction}
                  hidden={{ loanId: loan.id }}
                  triggerLabel="Ya no lo necesito"
                  title="¿Liberar el ejemplar apartado?"
                  description={<p>Pasará a la siguiente persona en espera o volverá a la estantería.</p>}
                  confirmLabel="Liberar ejemplar"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pending.length ? (
        <section className={styles.section} aria-labelledby="solicitudes">
          <h2 id="solicitudes" className={styles.sectionTitle}>
            Solicitudes pendientes
          </h2>
          <ul role="list" className={styles.rows}>
            {pending.map((loan) => (
              <li key={loan.id} className={styles.row}>
                <LoanBook loan={loan} />
                <p className={styles.rowStatus}>
                  <span className="badge badge--info">{LOAN_STATUS.pending.label}</span>
                  Pedido el {formatDate(loan.requestedAt)} por {loan.loanDays} días
                  {loan.loanCardNumber ? ` con el carné ${loan.loanCardNumber}` : ''}. Te avisaremos cuando esté apartado.
                </p>
                <ConfirmAction
                  action={cancelLoanAction}
                  hidden={{ loanId: loan.id }}
                  triggerLabel="Cancelar"
                  title="¿Cancelar la solicitud?"
                  description={<p>Puedes volver a pedirlo cuando quieras.</p>}
                  confirmLabel="Cancelar solicitud"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {reservations.length ? (
        <section className={styles.section} aria-labelledby="espera">
          <h2 id="espera" className={styles.sectionTitle}>
            En lista de espera
          </h2>
          <ul role="list" className={styles.rows}>
            {reservations.map((reservation) => (
              <li key={reservation.id} className={styles.row}>
                <div className={styles.book}>
                  <BookCover
                    title={reservation.bookTitle}
                    authors={reservation.bookAuthors}
                    coverKey={reservation.coverKey}
                    coverColor={reservation.coverColor}
                    sizes="72px"
                    className={styles.bookCover}
                  />
                  <div>
                    <h3 className={styles.bookTitle}>
                      <Link href={`/libros/${reservation.bookSlug}`}>{reservation.bookTitle}</Link>
                    </h3>
                    <p className={styles.bookAuthor}>{joinAuthors(reservation.bookAuthors)}</p>
                  </div>
                </div>
                <p className={styles.rowStatus}>
                  <BookmarkPlus aria-hidden="true" />
                  {reservation.position === 1
                    ? 'Eres la siguiente persona: te avisaremos en cuanto vuelva un ejemplar.'
                    : `Puesto ${reservation.position} en la cola. Reservado el ${formatDate(reservation.createdAt)}.`}
                </p>
                <ConfirmAction
                  action={cancelReservationAction}
                  hidden={{ reservationId: reservation.id }}
                  triggerLabel="Salir de la lista"
                  title="¿Salir de la lista de espera?"
                  description={<p>Perderás tu puesto en la cola de este libro.</p>}
                  confirmLabel="Salir de la lista"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {history.length ? (
        <section className={styles.section} aria-labelledby="historial">
          <h2 id="historial" className={styles.sectionTitle}>
            Historial
          </h2>
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Tus préstamos y solicitudes cerrados</caption>
              <thead>
                <tr>
                  <th scope="col">Libro</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Fecha</th>
                  <th scope="col">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {history.map((loan) => {
                  const status = LOAN_STATUS[loan.status]
                  const date = loan.returnedAt ?? loan.decidedAt ?? loan.requestedAt
                  return (
                    <tr key={loan.id}>
                      <td>
                        <Link href={`/libros/${loan.bookSlug}`} className="link">
                          {loan.bookTitle}
                        </Link>
                      </td>
                      <td>
                        <span className={`badge badge--${status.tone}`}>{status.label}</span>
                      </td>
                      <td>{formatDate(date)}</td>
                      <td className="muted">{loan.rejectionReason ?? status.help}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {settledFines.length ? (
        <section className={styles.section} aria-labelledby="multas-saldadas">
          <h2 id="multas-saldadas" className={styles.sectionTitle}>
            Multas saldadas
          </h2>
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Multas pagadas o condonadas</caption>
              <thead>
                <tr>
                  <th scope="col">Libro</th>
                  <th scope="col">Retraso</th>
                  <th scope="col" className="num">
                    Multa
                  </th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                {settledFines.map((fine) => (
                  <tr key={fine.id}>
                    <td>{fine.bookTitle}</td>
                    <td>{describeLate(fine.daysLate)}</td>
                    <td className="num">{formatCOP(fine.amount)}</td>
                    <td>
                      <span className={`badge badge--${FINE_STATUS[fine.status].tone}`}>{FINE_STATUS[fine.status].label}</span>
                      <span className="meta" style={{ display: 'block' }}>
                        {formatDate(fine.settledAt!)}
                        {fine.status === 'waived' && fine.settleNote ? ` · ${fine.settleNote}` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
