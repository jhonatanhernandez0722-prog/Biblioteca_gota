import { CircleAlert, Import } from 'lucide-react'
import Link from 'next/link'
import { approveLoanAction, checkoutLoanAction } from '@/actions/admin'
import { AdminHeader, Panel } from '@/components/admin/AdminPage'
import { ActionButton } from '@/components/ui/ConfirmAction'
import { describeDue, formatDateTime, formatShortDate } from '@/lib/dates'
import { requireStaff } from '@/server/auth/current-user'
import { describeAudit, listAudit } from '@/server/audit'
import { expireStalePickups, getDashboardStats, listStaffLoans } from '@/server/circulation'
import styles from './dashboard.module.css'

export const metadata = { title: 'Resumen' }

export default async function AdminDashboard() {
  const user = await requireStaff()
  expireStalePickups()
  const stats = getDashboardStats()
  const requests = listStaffLoans({ view: 'requests', page: 1, pageSize: 5 })
  const overdue = listStaffLoans({ view: 'overdue', page: 1, pageSize: 5 })
  const pickups = listStaffLoans({ view: 'pickup', page: 1, pageSize: 5 })
  const activity = listAudit({ page: 1, pageSize: 8 })

  const tiles = [
    { label: 'Libros en el catálogo', value: stats.books, href: '/admin/libros' },
    {
      label: 'Ejemplares en estantería',
      value: stats.copiesAvailable,
      detail: `de ${stats.copiesTotal} en la colección`,
      href: '/admin/libros',
    },
    { label: 'Préstamos activos', value: stats.activeLoans, href: '/admin/prestamos?vista=activos' },
    { label: 'Solicitudes pendientes', value: stats.pendingRequests, href: '/admin/prestamos?vista=solicitudes', tone: stats.pendingRequests ? 'brand' : undefined },
    { label: 'Préstamos vencidos', value: stats.overdue, href: '/admin/prestamos?vista=vencidos', tone: stats.overdue ? 'danger' : undefined },
    { label: 'Por recoger', value: stats.pickups, href: '/admin/prestamos?vista=recoger' },
    { label: 'En lista de espera', value: stats.waitingReservations, href: '/admin/prestamos?vista=reservas' },
    { label: 'Lectores activos', value: stats.readers, href: '/admin/usuarios?rol=reader' },
  ]

  return (
    <>
      <AdminHeader
        title={`Hola, ${user.name.split(' ')[0]}`}
        description="Así está hoy la biblioteca. Todos los números salen de los registros actuales."
        actions={
          <Link href="/admin/libros/importar" className="btn">
            <Import aria-hidden="true" />
            Importar libro
          </Link>
        }
      />

      <ul role="list" className={styles.tiles}>
        {tiles.map((tile) => (
          <li key={tile.label}>
            <Link href={tile.href} className={`${styles.tile} ${tile.tone ? styles[tile.tone] : ''}`}>
              <span className={styles.tileLabel}>{tile.label}</span>
              <span className={styles.tileValue}>{tile.value}</span>
              {tile.detail ? <span className={styles.tileDetail}>{tile.detail}</span> : null}
            </Link>
          </li>
        ))}
      </ul>

      <div className={styles.columns}>
        <Panel
          id="solicitudes"
          title="Solicitudes por atender"
          description="Las más antiguas primero."
          actions={
            <Link href="/admin/prestamos?vista=solicitudes" className="link">
              Ver todas
            </Link>
          }
        >
          {requests.loans.length ? (
            <ul role="list" className={styles.list}>
              {requests.loans.map((loan) => (
                <li key={loan.id} className={styles.item}>
                  <div className={styles.itemText}>
                    <p className={styles.itemTitle}>{loan.bookTitle}</p>
                    <p className="meta">
                      {loan.userName}, pedido el {formatShortDate(loan.requestedAt)}
                    </p>
                  </div>
                  <div className={styles.itemActions}>
                    <ActionButton action={approveLoanAction} hidden={{ loanId: loan.id }} className="btn btn--sm">
                      Aprobar
                    </ActionButton>
                    <ActionButton action={checkoutLoanAction} hidden={{ loanId: loan.id }} className="btn btn--secondary btn--sm">
                      Entregar
                    </ActionButton>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>No hay solicitudes pendientes.</p>
          )}
        </Panel>

        <Panel
          id="vencidos"
          title="Préstamos vencidos"
          actions={
            <Link href="/admin/prestamos?vista=vencidos" className="link">
              Ver todos
            </Link>
          }
        >
          {overdue.loans.length ? (
            <ul role="list" className={styles.list}>
              {overdue.loans.map((loan) => (
                <li key={loan.id} className={styles.item}>
                  <div className={styles.itemText}>
                    <p className={styles.itemTitle}>{loan.bookTitle}</p>
                    <p className="meta">
                      {loan.userName} ({loan.userCardNumber})
                    </p>
                  </div>
                  <span className="badge badge--danger">
                    <CircleAlert aria-hidden="true" />
                    {describeDue(loan.dueAt!)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>Ningún préstamo vencido.</p>
          )}
        </Panel>

        <Panel
          id="recoger"
          title="Apartados por recoger"
          actions={
            <Link href="/admin/prestamos?vista=recoger" className="link">
              Ver todos
            </Link>
          }
        >
          {pickups.loans.length ? (
            <ul role="list" className={styles.list}>
              {pickups.loans.map((loan) => (
                <li key={loan.id} className={styles.item}>
                  <div className={styles.itemText}>
                    <p className={styles.itemTitle}>{loan.bookTitle}</p>
                    <p className="meta">
                      {loan.userName}, ejemplar {loan.copyCode}, hasta el {formatShortDate(loan.pickupDeadline!)}
                    </p>
                  </div>
                  <ActionButton action={checkoutLoanAction} hidden={{ loanId: loan.id }} className="btn btn--sm">
                    Entregar
                  </ActionButton>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.empty}>Nada por recoger.</p>
          )}
        </Panel>

        <Panel
          id="actividad"
          title="Actividad reciente"
          actions={
            <Link href="/admin/actividad" className="link">
              Historial completo
            </Link>
          }
        >
          {activity.entries.length ? (
            <ol className={styles.activity}>
              {activity.entries.map((entry) => (
                <li key={entry.id}>
                  <p>{describeAudit(entry)}</p>
                  <p className="meta">{formatDateTime(entry.createdAt)}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className={styles.empty}>Todavía no hay actividad.</p>
          )}
        </Panel>
      </div>
    </>
  )
}
