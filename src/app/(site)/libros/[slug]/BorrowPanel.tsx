import { BookmarkPlus, CalendarClock, CircleAlert, Clock, HandHelping, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { cancelLoanAction, cancelReservationAction, renewLoanAction, requestLoanAction, reserveAction } from '@/actions/reader'
import { ActionButton, ConfirmAction } from '@/components/ui/ConfirmAction'
import { describeDue, formatDate } from '@/lib/dates'
import { LOAN_RULES } from '@/lib/rules'
import { loanDisplayStatus } from '@/lib/status'
import type { BookDetail, SessionUser } from '@/lib/types'
import { getReaderEligibility, getUserBookState } from '@/server/circulation'
import styles from './book.module.css'

/** La acción principal de la ficha cambia según quién mira y en qué punto está con este libro. */
export function BorrowPanel({ book, user }: { book: BookDetail; user: SessionUser | null }) {
  const free = book.availableCopies
  const hasCopies = book.totalCopies > 0
  const next = `/libros/${book.slug}`
  const hidden = { bookId: book.id, slug: book.slug }

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
    const state = getUserBookState(user.id, book.id)
    const eligibility = getReaderEligibility(user.id)
    const loan = state.loan
    if (loan) {
      const display = loanDisplayStatus(loan.status, loan.dueAt)
      if (loan.status === 'pending') {
        status = (
          <p className={styles.panelStatus}>
            <Clock aria-hidden="true" /> Pediste este libro el {formatDate(loan.requestedAt)}. El equipo lo apartará para
            ti.
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
        status = (
          <p className={`${styles.panelStatus} ${display === 'overdue' ? styles.overdue : ''}`}>
            {display === 'overdue' ? <CircleAlert aria-hidden="true" /> : <CalendarClock aria-hidden="true" />}
            Lo tienes en préstamo hasta el {formatDate(loan.dueAt!)} ({describeDue(loan.dueAt!)}).
          </p>
        )
        const canRenew =
          display !== 'overdue' && loan.renewals < LOAN_RULES.maxRenewals && book.waitingReservations === 0
        action = canRenew ? (
          <ActionButton action={renewLoanAction} hidden={{ loanId: loan.id, slug: book.slug }} className="btn btn--block">
            <RefreshCw aria-hidden="true" />
            Renovar {LOAN_RULES.loanDays} días más
          </ActionButton>
        ) : null
        help = (
          <p className={styles.panelHelp}>
            {display === 'overdue'
              ? 'Devuélvelo en el mostrador cuanto antes: mientras esté vencido no podrás pedir otros libros.'
              : canRenew
                ? `Renovaciones usadas: ${loan.renewals} de ${LOAN_RULES.maxRenewals}.`
                : book.waitingReservations > 0
                  ? 'Otra persona lo está esperando, así que no se puede renovar.'
                  : `Ya usaste las ${LOAN_RULES.maxRenewals} renovaciones.`}
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
      action = (
        <Link href="/cuenta" className="btn btn--secondary btn--block">
          Ver mis préstamos
        </Link>
      )
    } else if (free > 0) {
      status = (
        <p className={styles.panelStatus}>
          {free === 1 ? 'Queda 1 ejemplar disponible.' : `Hay ${free} ejemplares disponibles.`}
        </p>
      )
      action = (
        <ActionButton action={requestLoanAction} hidden={hidden} className="btn btn--block" pendingLabel="Enviando…">
          <HandHelping aria-hidden="true" />
          Solicitar préstamo
        </ActionButton>
      )
      help = (
        <p className={styles.panelHelp}>
          Lo apartamos en el mostrador y tienes {LOAN_RULES.pickupDays} días para recogerlo.
        </p>
      )
    } else {
      status = (
        <p className={styles.panelStatus}>
          Todos los ejemplares están prestados
          {book.waitingReservations > 0
            ? ` y ${book.waitingReservations === 1 ? 'una persona espera' : `${book.waitingReservations} personas esperan`}.`
            : '.'}
        </p>
      )
      action = (
        <ActionButton action={reserveAction} hidden={hidden} className="btn btn--block" pendingLabel="Reservando…">
          <BookmarkPlus aria-hidden="true" />
          Reservar
        </ActionButton>
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
