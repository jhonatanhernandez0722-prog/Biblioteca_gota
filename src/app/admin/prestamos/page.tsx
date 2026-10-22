import { Search } from 'lucide-react'
import Form from 'next/form'
import Link from 'next/link'
import {
  approveLoanAction,
  checkoutLoanAction,
  payFineAction,
  rejectLoanAction,
  returnLoanAction,
  staffCancelLoanAction,
  staffCancelReservationAction,
  waiveFineAction,
} from '@/actions/admin'
import { AdminHeader, TabLinks } from '@/components/admin/AdminPage'
import { ActionButton, ConfirmAction } from '@/components/ui/ConfirmAction'
import { Pagination } from '@/components/ui/Pagination'
import { calendarDaysFrom, describeDue, formatDate, formatShortDate } from '@/lib/dates'
import { accruedFine, describeLate, formatCOP } from '@/lib/fines'
import { FINE_RULES, LOAN_RULES } from '@/lib/rules'
import { FINE_STATUS, LOAN_STATUS } from '@/lib/status'
import type { LoanRecord } from '@/lib/types'
import { requireStaff } from '@/server/auth/current-user'
import {
  countStaffLoanViews,
  expireStalePickups,
  listStaffFines,
  listStaffLoans,
  listWaitingReservations,
  type StaffFineView,
  type StaffLoanView,
} from '@/server/circulation'
import styles from '../table-page.module.css'

export const metadata = { title: 'Préstamos' }

const VIEWS: { key: string; view: StaffLoanView | 'reservations' | 'fines'; label: string }[] = [
  { key: 'solicitudes', view: 'requests', label: 'Solicitudes' },
  { key: 'recoger', view: 'pickup', label: 'Por recoger' },
  { key: 'activos', view: 'active', label: 'Prestados' },
  { key: 'vencidos', view: 'overdue', label: 'Vencidos' },
  { key: 'multas', view: 'fines', label: 'Multas' },
  { key: 'reservas', view: 'reservations', label: 'Lista de espera' },
  { key: 'historial', view: 'history', label: 'Historial' },
]

const PAGE_SIZE = 25

function Reader({ loan }: { loan: Pick<LoanRecord, 'userId' | 'userName' | 'userCardNumber'> & { loanCardNumber?: string | null } }) {
  // El carné con el que se pidió, si no es el principal, es el que se presenta en el mostrador.
  const card = loan.loanCardNumber ?? loan.userCardNumber
  return (
    <div className={styles.person}>
      <Link href={`/admin/usuarios/${loan.userId}`} className={styles.rowTitle}>
        {loan.userName}
      </Link>
      <span className="meta">
        {card}
        {card !== loan.userCardNumber ? ' (adicional)' : ''}
      </span>
    </div>
  )
}

function BookCell({ loan }: { loan: Pick<LoanRecord, 'bookId' | 'bookTitle' | 'copyCode'> }) {
  return (
    <div className={styles.person}>
      <Link href={`/admin/libros/${loan.bookId}`} className={styles.rowTitle}>
        {loan.bookTitle}
      </Link>
      {loan.copyCode ? <span className="meta">Ejemplar {loan.copyCode}</span> : null}
    </div>
  )
}

function RejectButton({ loan, label = 'Rechazar' }: { loan: LoanRecord; label?: string }) {
  return (
    <ConfirmAction
      action={rejectLoanAction}
      hidden={{ loanId: loan.id }}
      triggerLabel={label}
      triggerClassName="btn btn--danger-ghost btn--sm"
      title={`¿Rechazar la solicitud de ${loan.userName}?`}
      description={<p>«{loan.bookTitle}». El lector recibirá el motivo por correo y lo verá en su cuenta.</p>}
      reason={{
        label: 'Motivo',
        placeholder: 'Por ejemplo: el ejemplar está en reparación hasta la próxima semana.',
        hint: 'Explícalo en una frase clara: lo leerá la persona que pidió el libro.',
      }}
      confirmLabel="Rechazar solicitud"
    />
  )
}

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; q?: string; pagina?: string; estado?: string }>
}) {
  await requireStaff('/admin/prestamos')
  await expireStalePickups()
  const sp = await searchParams
  const current = VIEWS.find((v) => v.key === sp.vista) ?? VIEWS[0]!
  const q = sp.q?.trim().slice(0, 120) ?? ''
  const page = Math.max(1, Number.parseInt(sp.pagina ?? '1', 10) || 1)
  const fineView: StaffFineView = sp.estado === 'saldadas' ? 'settled' : 'pending'
  const counts = await countStaffLoanViews()

  const tabs = VIEWS.map((v) => ({
    key: v.key,
    label: v.label,
    href: `/admin/prestamos?vista=${v.key}`,
    count: v.view === 'history' ? undefined : counts[v.view],
    tone: v.view === 'overdue' || v.view === 'fines' ? ('danger' as const) : undefined,
  }))

  const reservations = current.view === 'reservations' ? await listWaitingReservations({ q, page, pageSize: PAGE_SIZE }) : null
  const fines = current.view === 'fines' ? await listStaffFines({ view: fineView, q, page, pageSize: PAGE_SIZE }) : null
  const loans =
    current.view !== 'reservations' && current.view !== 'fines'
      ? await listStaffLoans({ view: current.view, q, page, pageSize: PAGE_SIZE })
      : null
  const total = reservations?.total ?? fines?.total ?? loans?.total ?? 0

  return (
    <>
      <AdminHeader
        title="Préstamos"
        description={`Plazos de ${LOAN_RULES.loanPeriods.join(', ')} días que elige el lector y no se renuevan; ${LOAN_RULES.pickupDays} días para recoger; multa de ${formatCOP(FINE_RULES.dailyFine)} por día de retraso, generada al registrar la devolución.`}
      />
      <div className={styles.toolbar}>
        <TabLinks tabs={tabs} current={current.key} label="Vistas de préstamos" />
        <Form action="/admin/prestamos" className={styles.search} role="search">
          <input type="hidden" name="vista" value={current.key} />
          {current.view === 'fines' && fineView === 'settled' ? <input type="hidden" name="estado" value="saldadas" /> : null}
          <label htmlFor="q" className="visually-hidden">
            Buscar por lector, carné, libro o ejemplar
          </label>
          <input id="q" name="q" type="search" className="input" defaultValue={q} placeholder="Lector, carné, libro o ejemplar" />
          <button type="submit" className="btn btn--secondary btn--sm" aria-label="Buscar">
            <Search aria-hidden="true" />
          </button>
        </Form>
      </div>

      {total === 0 ? (
        <div className="empty">
          <h2>{q ? `Nada coincide con «${q}»` : `No hay nada en «${current.label}»`}</h2>
          <p>
            {q
              ? 'Revisa el nombre, el número de carné o el código del ejemplar.'
              : current.view === 'requests'
                ? 'Cuando un lector pida un libro desde la web, la solicitud aparecerá aquí.'
                : 'Esta vista se llenará con la actividad de la biblioteca.'}
          </p>
        </div>
      ) : null}

      {loans && loans.loans.length ? (
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">{current.label}</caption>
            <thead>
              <tr>
                <th scope="col">Lector</th>
                <th scope="col">Libro</th>
                {current.view === 'requests' ? <th scope="col">Pedido</th> : null}
                {current.view === 'pickup' ? <th scope="col">Recoger antes del</th> : null}
                {current.view === 'active' || current.view === 'overdue' ? (
                  <>
                    <th scope="col">Devolución</th>
                    <th scope="col" className="num">
                      {current.view === 'overdue' ? 'Multa acumulada' : 'Plazo'}
                    </th>
                  </>
                ) : null}
                {current.view === 'requests' || current.view === 'pickup' ? (
                  <th scope="col" className="num">
                    Plazo
                  </th>
                ) : null}
                {current.view === 'history' ? (
                  <>
                    <th scope="col">Resultado</th>
                    <th scope="col">Fecha</th>
                  </>
                ) : null}
                {current.view !== 'history' ? (
                  <th scope="col" className="actions">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {loans.loans.map((loan) => (
                <tr key={loan.id}>
                  <td>
                    <Reader loan={loan} />
                  </td>
                  <td>
                    <BookCell loan={loan} />
                  </td>
                  {current.view === 'requests' ? (
                    <td>
                      {formatShortDate(loan.requestedAt)}
                      <span className="meta" style={{ display: 'block' }}>
                        hace {Math.max(0, -calendarDaysFrom(loan.requestedAt))} días
                      </span>
                    </td>
                  ) : null}
                  {current.view === 'pickup' ? <td>{formatDate(loan.pickupDeadline!)}</td> : null}
                  {current.view === 'requests' || current.view === 'pickup' ? <td className="num">{loan.loanDays} días</td> : null}
                  {current.view === 'active' || current.view === 'overdue' ? (
                    <>
                      <td className={current.view === 'overdue' ? styles.late : undefined}>
                        {formatShortDate(loan.dueAt!)}
                        <span className="meta" style={{ display: 'block', color: 'inherit' }}>
                          {describeDue(loan.dueAt!)}
                        </span>
                      </td>
                      <td className="num">
                        {current.view === 'overdue' ? (
                          <>
                            <strong className={styles.late}>{formatCOP(accruedFine(loan.dueAt!).amount)}</strong>
                            <span className="meta" style={{ display: 'block' }}>
                              {describeLate(accruedFine(loan.dueAt!).days)}
                            </span>
                          </>
                        ) : (
                          `${loan.loanDays} días`
                        )}
                      </td>
                    </>
                  ) : null}
                  {current.view === 'history' ? (
                    <>
                      <td>
                        <span className={`badge badge--${LOAN_STATUS[loan.status].tone}`}>{LOAN_STATUS[loan.status].label}</span>
                        {loan.rejectionReason ? (
                          <span className="meta" style={{ display: 'block' }}>
                            {loan.rejectionReason}
                          </span>
                        ) : null}
                      </td>
                      <td>{formatShortDate(loan.returnedAt ?? loan.decidedAt ?? loan.requestedAt)}</td>
                    </>
                  ) : null}
                  {current.view !== 'history' ? (
                    <td className="actions">
                      <div className={styles.rowActions}>
                        {current.view === 'requests' ? (
                          <>
                            <ActionButton action={approveLoanAction} hidden={{ loanId: loan.id }} className="btn btn--sm">
                              Aprobar
                            </ActionButton>
                            <ActionButton action={checkoutLoanAction} hidden={{ loanId: loan.id }} className="btn btn--secondary btn--sm">
                              Entregar ahora
                            </ActionButton>
                            <RejectButton loan={loan} />
                          </>
                        ) : null}
                        {current.view === 'pickup' ? (
                          <>
                            <ActionButton action={checkoutLoanAction} hidden={{ loanId: loan.id }} className="btn btn--sm">
                              Entregar
                            </ActionButton>
                            <ConfirmAction
                              action={staffCancelLoanAction}
                              hidden={{ loanId: loan.id }}
                              triggerLabel="Anular apartado"
                              triggerClassName="btn btn--ghost btn--sm"
                              title="¿Anular el apartado?"
                              description={<p>El ejemplar pasará a la siguiente persona en espera o volverá a la estantería.</p>}
                              confirmLabel="Anular apartado"
                            />
                          </>
                        ) : null}
                        {current.view === 'active' || current.view === 'overdue' ? (
                          <>
                            <ConfirmAction
                              action={returnLoanAction}
                              hidden={{ loanId: loan.id }}
                              triggerLabel="Registrar devolución"
                              triggerClassName="btn btn--sm"
                              title={`Devolución de «${loan.bookTitle}»`}
                              description={
                                <div style={{ display: 'grid', gap: 12 }}>
                                  <p>
                                    Ejemplar {loan.copyCode}, prestado a {loan.userName}. Si hay lista de espera, quedará apartado
                                    para la siguiente persona.
                                  </p>
                                  {current.view === 'overdue' ? (
                                    <p className="alert alert--warning">
                                      Llega con {describeLate(accruedFine(loan.dueAt!).days)}: se generará una multa de{' '}
                                      {accruedFine(loan.dueAt!).days} × {formatCOP(FINE_RULES.dailyFine)} ={' '}
                                      <strong>{formatCOP(accruedFine(loan.dueAt!).amount)}</strong>.
                                    </p>
                                  ) : null}
                                  <label className="check">
                                    <input type="checkbox" name="toMaintenance" />
                                    Vuelve dañado: enviarlo a reparación
                                  </label>
                                </div>
                              }
                              confirmLabel="Registrar devolución"
                              confirmClassName="btn"
                            />
                          </>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {fines ? (
        <div className={styles.toolbar} style={{ marginBottom: 16 }}>
          <TabLinks
            tabs={[
              { key: 'pending', label: 'Por cobrar', href: '/admin/prestamos?vista=multas' },
              { key: 'settled', label: 'Saldadas', href: '/admin/prestamos?vista=multas&estado=saldadas' },
            ]}
            current={fineView}
            label="Estado de las multas"
          />
          {fines.total ? (
            <p className="meta">
              {fines.total} {fines.total === 1 ? 'multa' : 'multas'} · {formatCOP(fines.amount)}
            </p>
          ) : null}
        </div>
      ) : null}

      {fines && fines.fines.length ? (
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">Multas {fineView === 'pending' ? 'por cobrar' : 'saldadas'}</caption>
            <thead>
              <tr>
                <th scope="col">Lector</th>
                <th scope="col">Libro</th>
                <th scope="col">Retraso</th>
                <th scope="col" className="num">
                  Multa
                </th>
                {fineView === 'settled' ? <th scope="col">Resultado</th> : null}
                {fineView === 'pending' ? (
                  <th scope="col" className="actions">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {fines.fines.map((fine) => (
                <tr key={fine.id}>
                  <td>
                    <div className={styles.person}>
                      <Link href={`/admin/usuarios/${fine.userId}`} className={styles.rowTitle}>
                        {fine.userName}
                      </Link>
                      <span className="meta">{fine.userCardNumber}</span>
                    </div>
                  </td>
                  <td>
                    {fine.bookTitle}
                    <span className="meta" style={{ display: 'block' }}>
                      Venció {formatShortDate(fine.dueAt)} · devuelto {formatShortDate(fine.returnedAt)}
                    </span>
                  </td>
                  <td>{describeLate(fine.daysLate)}</td>
                  <td className="num">
                    <strong>{formatCOP(fine.amount)}</strong>
                    <span className="meta" style={{ display: 'block' }}>
                      {fine.daysLate} × {formatCOP(fine.dailyRate)}
                    </span>
                  </td>
                  {fineView === 'settled' ? (
                    <td>
                      <span className={`badge badge--${FINE_STATUS[fine.status].tone}`}>{FINE_STATUS[fine.status].label}</span>
                      <span className="meta" style={{ display: 'block' }}>
                        {formatShortDate(fine.settledAt!)}
                        {fine.settleNote ? ` · ${fine.settleNote}` : ''}
                      </span>
                    </td>
                  ) : (
                    <td className="actions">
                      <div className={styles.rowActions}>
                        <ConfirmAction
                          action={payFineAction}
                          hidden={{ fineId: fine.id }}
                          triggerLabel="Registrar pago"
                          triggerClassName="btn btn--sm"
                          title={`Pago de ${formatCOP(fine.amount)}`}
                          description={
                            <p>
                              {fine.userName} paga en el mostrador la multa por «{fine.bookTitle}» ({describeLate(fine.daysLate)}).
                            </p>
                          }
                          confirmLabel="Registrar pago"
                          confirmClassName="btn"
                        />
                        <ConfirmAction
                          action={waiveFineAction}
                          hidden={{ fineId: fine.id }}
                          triggerLabel="Condonar"
                          triggerClassName="btn btn--ghost btn--sm"
                          title={`¿Condonar ${formatCOP(fine.amount)}?`}
                          description={<p>La multa de {fine.userName} quedará saldada sin pago. El motivo queda registrado.</p>}
                          reason={{
                            label: 'Motivo',
                            placeholder: 'Por ejemplo: la devolución se registró tarde por un error del mostrador.',
                          }}
                          confirmLabel="Condonar multa"
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {reservations && reservations.reservations.length ? (
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">Lista de espera</caption>
            <thead>
              <tr>
                <th scope="col">Libro</th>
                <th scope="col">Lector</th>
                <th scope="col" className="num">
                  Puesto
                </th>
                <th scope="col">Desde</th>
                <th scope="col" className="actions">
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {reservations.reservations.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/libros/${r.bookId}`} className={styles.rowTitle}>
                      {r.bookTitle}
                    </Link>
                  </td>
                  <td>
                    <Link href={`/admin/usuarios/${r.userId}`} className={styles.rowTitle}>
                      {r.userName}
                    </Link>
                  </td>
                  <td className="num">{r.position}</td>
                  <td>{formatShortDate(r.createdAt)}</td>
                  <td className="actions">
                    <ConfirmAction
                      action={staffCancelReservationAction}
                      hidden={{ reservationId: r.id }}
                      triggerLabel="Cancelar reserva"
                      triggerClassName="btn btn--ghost btn--sm"
                      title="¿Cancelar esta reserva?"
                      description={<p>{r.userName} saldrá de la lista de espera de «{r.bookTitle}».</p>}
                      confirmLabel="Cancelar reserva"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        basePath="/admin/prestamos"
        params={{
          vista: current.key,
          q: q || undefined,
          estado: current.view === 'fines' && fineView === 'settled' ? 'saldadas' : undefined,
        }}
      />
    </>
  )
}
