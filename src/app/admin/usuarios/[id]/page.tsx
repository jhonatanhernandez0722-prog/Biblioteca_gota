import Link from 'next/link'
import { notFound } from 'next/navigation'
import { setUserStatusAction } from '@/actions/admin'
import { AdminHeader, Panel } from '@/components/admin/AdminPage'
import { RoleForm } from '@/components/admin/RoleForm'
import { ActionButton, ConfirmAction } from '@/components/ui/ConfirmAction'
import { describeDue, formatDate, formatShortDate } from '@/lib/dates'
import { LOAN_STATUS, loanDisplayStatus, ROLE_LABEL } from '@/lib/status'
import { requireStaff } from '@/server/auth/current-user'
import { listUserLoans, listUserReservations } from '@/server/circulation'
import { getUserById, maskEmail } from '@/server/users'
import styles from '../../table-page.module.css'

export const metadata = { title: 'Usuario' }

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  const staff = await requireStaff(`/admin/usuarios/${rawId}`)
  const id = Number.parseInt(rawId, 10)
  const user = Number.isInteger(id) && id > 0 ? await getUserById(id) : null
  if (!user) notFound()

  const loans = await listUserLoans(user.id)
  const reservations = (await listUserReservations(user.id)).filter((r) => r.status === 'waiting')
  const isAdmin = staff.role === 'admin'
  const canChangeStatus = staff.id !== user.id && (isAdmin || user.role === 'reader')

  return (
    <>
      <AdminHeader
        title={user.name}
        description={`${ROLE_LABEL[user.role]} desde el ${formatDate(user.createdAt)}. Carné ${user.cardNumber}.`}
        back={{ href: '/admin/usuarios', label: 'Usuarios' }}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 24, marginBottom: 24 }}>
        <Panel id="datos" title="Cuenta">
          <dl style={{ display: 'grid', gap: 12, margin: 0 }}>
            <div>
              <dt className="meta">Correo</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>{isAdmin ? user.email : maskEmail(user.email)}</dd>
            </div>
            <div>
              <dt className="meta">Estado</dt>
              <dd style={{ margin: 0 }}>
                {user.status === 'suspended' ? (
                  <span className="badge badge--danger">Suspendida</span>
                ) : (
                  <span className="badge badge--success">Activa</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="meta">Préstamos en curso / vencidos</dt>
              <dd style={{ margin: 0, fontWeight: 600 }}>
                {user.activeLoans} / {user.overdueLoans}
              </dd>
            </div>
          </dl>
          {canChangeStatus ? (
            user.status === 'active' ? (
              <ConfirmAction
                action={setUserStatusAction}
                hidden={{ userId: user.id, status: 'suspended' }}
                triggerLabel="Suspender cuenta"
                triggerClassName="btn btn--danger-ghost btn--sm"
                title={`¿Suspender la cuenta de ${user.name}?`}
                description={
                  <p>
                    No podrá entrar, pedir ni reservar libros, y se cancelarán sus reservas en espera. Los préstamos en curso
                    siguen abiertos hasta su devolución.
                  </p>
                }
                confirmLabel="Suspender"
              />
            ) : (
              <ActionButton action={setUserStatusAction} hidden={{ userId: user.id, status: 'active' }} className="btn btn--secondary btn--sm">
                Reactivar cuenta
              </ActionButton>
            )
          ) : null}
        </Panel>
        {isAdmin && staff.id !== user.id ? (
          <Panel id="permisos" title="Permisos" description="Cambiar el perfil cierra las sesiones abiertas de la persona.">
            <RoleForm userId={user.id} role={user.role} />
          </Panel>
        ) : null}
        {reservations.length ? (
          <Panel id="espera" title="En lista de espera">
            <ul role="list" style={{ display: 'grid', gap: 8 }}>
              {reservations.map((r) => (
                <li key={r.id}>
                  <Link href={`/admin/libros/${r.bookId}`} className="link">
                    {r.bookTitle}
                  </Link>{' '}
                  <span className="meta">puesto {r.position}</span>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>

      <Panel id="historial" title="Préstamos" description="Lo necesario para atender a la persona; no se guarda nada más.">
        {loans.length ? (
          <div className="table-wrap">
            <table className="table">
              <caption className="visually-hidden">Préstamos de {user.name}</caption>
              <thead>
                <tr>
                  <th scope="col">Libro</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Pedido</th>
                  <th scope="col">Devolución</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => {
                  const display = loanDisplayStatus(loan.status, loan.dueAt)
                  return (
                    <tr key={loan.id}>
                      <td>
                        <Link href={`/admin/libros/${loan.bookId}`} className={styles.rowTitle}>
                          {loan.bookTitle}
                        </Link>
                        {loan.copyCode ? <span className="meta" style={{ display: 'block' }}>Ejemplar {loan.copyCode}</span> : null}
                      </td>
                      <td>
                        <span className={`badge badge--${LOAN_STATUS[display].tone}`}>{LOAN_STATUS[display].label}</span>
                      </td>
                      <td>{formatShortDate(loan.requestedAt)}</td>
                      <td>
                        {loan.returnedAt
                          ? `Devuelto el ${formatShortDate(loan.returnedAt)}`
                          : loan.dueAt
                            ? `${formatShortDate(loan.dueAt)} (${describeDue(loan.dueAt)})`
                            : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">Todavía no ha pedido libros.</p>
        )}
      </Panel>
    </>
  )
}
