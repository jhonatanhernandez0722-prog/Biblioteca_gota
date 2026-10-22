import { BookmarkPlus, CalendarClock, CircleAlert, Clock, HandHelping, Lock } from 'lucide-react'
import Link from 'next/link'
import { cancelLoanAction, cancelReservationAction, requestLoanAction, reserveAction } from '@/actions/reader'
import { BorrowRequest } from '@/components/books/BorrowRequest'
import { ConfirmAction } from '@/components/ui/ConfirmAction'
import { describeDue, formatDate } from '@/lib/dates'
import { accruedFine, describeLate, formatCOP } from '@/lib/fines'
import { FINE_RULES, LOAN_RULES } from '@/lib/rules'
import { loanDisplayStatus } from '@/lib/status'
import type { BookDetail, SessionUser } from '@/lib/types'
import { getReaderEligibility, getUserBookState } from '@/server/circulation'
import { listLoanCards } from '@/server/users'
import styles from './book.module.css'

/** La acción principal de la ficha cambia según quién mira y en qué punto está con este libro. */
export async function BorrowPanel({ book, user }: { book: BookDetail; user: SessionUser | null }) {
  const free = book.availableCopies
  const hasCopies = book.totalCopies > 0
  const next = `/libros/${book.slug}`

  let status: React.ReactNode
  let action: React.ReactNode = null
  let help: React.ReactNode = null

  if (book.status === 'archived') {
    status = <p className={styles.panelStatus}>Este libro está archivado y no admite préstamos.</p>
  } else if (!hasCopies) {
    status = <p className={styles.panelStatus}>Este título está en el catálogo, pero todavía no tiene ejemplares.</p>
  } else if (!user) {
    status = (
      <p className={styles.panelStatus}>
        {free > 0 ? 'Disponible ahora.' : 'Todos los ejemplares están prestados.'}
      </p>
    )
    action = (
      <Link href={`/entrar?siguiente=${encodeURIComponent(next)}`} className="btn btn--block">
        {free > 0 ? 'Entra para pedirlo' : 'Entra para reservarlo'}
      </Link>
    )
    help = (
      <p className={styles.panelHelp}>
        ¿Aún no tienes carné?{' '}
        <Link href={`/registro?siguiente=${encodeURIComponent(next)}`} className="link">
          Crea tu cuenta
        </Link>{' '}
        en dos minutos.
      </p>
    )
  } else {
    const state = await getUserBookState(user.id, book.id)
    const eligibility = await getReaderEligibility(user.id)
    const loan = state.loan
    if (loan) {
      const display = loanDisplayStatus(loan.status, loan.dueAt)
      if (loan.status === 'pending') {
        status = (
          <p className={styles.panelStatus}>
            <Clock aria-hidden="true" /> Pediste este libro el {formatDate(loan.requestedAt)} por {loan.loanDays} días. El
            equipo lo apartará para ti.
          </p>
        )
        action = (
          <ConfirmAction
            action={cancelLoanAction}
            hidden={{ loanId: loan.id, slug: book.slug }}
            triggerLabel="Cancelar solicitud"
            triggerClassName="btn btn--secondary btn--block"
            title="¿Cancelar la solicitud?"
            description={<p>Dejarás libre el ejemplar para otra persona. Puedes volver a pedirlo cuando quieras.</p>}
            confirmLabel="Cancelar solicitud"
          />
        )
      } else if (loan.status === 'approved') {
        status = (
          <p className={styles.panelStatus}>
            <HandHelping aria-hidden="true" /> Está apartado para ti. Recógelo en el mostrador antes del{' '}
            {formatDate(loan.pickupDeadline!)}.
          </p>
        )
        action = (
          <ConfirmAction
            action={cancelLoanAction}
            hidden={{ loanId: loan.id, slug: book.slug }}
            triggerLabel="Ya no lo necesito"
            triggerClassName="btn btn--secondary btn--block"
            title="¿Liberar el ejemplar apartado?"
            description={<p>El ejemplar pasará a la siguiente persona en espera o volverá a la estantería.</p>}
            confirmLabel="Liberar ejemplar"
          />
        )
      } else {
        const fine = accruedFine(loan.dueAt!)
        status = (
          <p className={`${styles.panelStatus} ${display === 'overdue' ? styles.overdue : ''}`}>
            {display === 'overdue' ? <CircleAlert aria-hidden="true" /> : <CalendarClock aria-hidden="true" />}
            Lo tienes en préstamo hasta el {formatDate(loan.dueAt!)} ({describeDue(loan.dueAt!)}).
          </p>
        )
        help = (
          <p className={styles.panelHelp}>
            {display === 'overdue' ? (
              <>
                Llevas {describeLate(fine.days)}: la multa va en <strong>{formatCOP(fine.amount)}</strong> y sube{' '}
                {formatCOP(FINE_RULES.dailyFine)} cada día. Devuélvelo en el mostrador cuanto antes.
              </>
            ) : (
              <>
                <Lock aria-hidden="true" width={14} height={14} /> Plazo fijo de {loan.loanDays} días: no se renueva. Si lo
                devuelves tarde, cada día suma {formatCOP(FINE_RULES.dailyFine)}.
              </>
            )}
          </p>
        )
      }
    } else if (state.reservation) {
      status = (
        <p className={styles.panelStatus}>
          <BookmarkPlus aria-hidden="true" /> Estás en la lista de espera: puesto {state.reservation.position}. Te
          avisaremos por correo cuando lo apartemos para ti.
        </p>
      )
      action = (
        <ConfirmAction
          action={cancelReservationAction}
          hidden={{ reservationId: state.reservation.id, slug: book.slug }}
          triggerLabel="Salir de la lista de espera"
          triggerClassName="btn btn--secondary btn--block"
          title="¿Salir de la lista de espera?"
          description={<p>Perderás tu puesto en la cola de este libro.</p>}
          confirmLabel="Salir de la lista"
        />
      )
    } else if (!eligibility.canRequest) {
      status = (
        <p className={`${styles.panelStatus} ${styles.overdue}`}>
          <CircleAlert aria-hidden="true" /> {eligibility.reason}
        </p>
      )
      action = eligibility.missingIdentity ? (
        <Link href="/cuenta/perfil#datos-prestamo" className="btn btn--block">
          Completar mis datos
        </Link>
      ) : (
        <Link href="/cuenta" className="btn btn--secondary btn--block">
          Ver mis préstamos
        </Link>
      )
    } else if (free > 0) {
      const cards = await listLoanCards(user.id)
      status = (
        <p className={styles.panelStatus}>
          {free === 1 ? 'Queda 1 ejemplar disponible.' : `Hay ${free} ejemplares disponibles.`}
        </p>
      )
      action = (
        <BorrowRequest
          action={requestLoanAction}
          mode="request"
          bookId={book.id}
          slug={book.slug}
          title={book.title}
          pageCount={book.pageCount}
          cards={cards}
          triggerLabel="Solicitar préstamo"
          triggerIcon={<HandHelping aria-hidden="true" />}
        />
      )
      help = (
        <p className={styles.panelHelp}>
          Eliges el plazo ({LOAN_RULES.loanPeriods.join(', ')} días) y el carné. Tienes {LOAN_RULES.pickupDays} días para
          recogerlo.
        </p>
      )
    } else {
      const cards = await listLoanCards(user.id)
      status = (
        <p className={styles.panelStatus}>
          Todos los ejemplares están prestados
          {book.waitingReservations > 0
            ? ` y ${book.waitingReservations === 1 ? 'una persona espera' : `${book.waitingReservations} personas esperan`}.`
            : '.'}
        </p>
      )
      action = (
        <BorrowRequest
          action={reserveAction}
          mode="reserve"
          bookId={book.id}
          slug={book.slug}
          title={book.title}
          pageCount={book.pageCount}
          cards={cards}
          triggerLabel="Reservar"
          triggerIcon={<BookmarkPlus aria-hidden="true" />}
        />
      )
      help = <p className={styles.panelHelp}>Cuando vuelva un ejemplar, lo apartamos para ti y te avisamos.</p>
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="disponibilidad">
      <h2 id="disponibilidad" className={styles.panelTitle}>
        Préstamo
      </h2>
      {status}
      {action ? <div className={styles.panelAction}>{action}</div> : null}
      {help}
    </section>
  )
}
