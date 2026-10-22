import Form from 'next/form'
import Link from 'next/link'
import { AdminHeader } from '@/components/admin/AdminPage'
import { AutoSubmit } from '@/components/catalog/AutoSubmit'
import { Pagination } from '@/components/ui/Pagination'
import { formatShortDate } from '@/lib/dates'
import { ROLE_LABEL } from '@/lib/status'
import type { Role, UserStatus } from '@/lib/types'
import { requireStaff } from '@/server/auth/current-user'
import { listUsers, maskEmail } from '@/server/users'
import styles from '../table-page.module.css'

export const metadata = { title: 'Usuarios' }

const PAGE_SIZE = 25

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; rol?: string; estado?: string; pagina?: string }>
}) {
  const staff = await requireStaff('/admin/usuarios')
  const sp = await searchParams
  const q = sp.q?.trim().slice(0, 120) ?? ''
  const role = (['reader', 'librarian', 'admin'] as Role[]).find((r) => r === sp.rol)
  const status = (['active', 'suspended'] as UserStatus[]).find((s) => s === sp.estado)
  const page = Math.max(1, Number.parseInt(sp.pagina ?? '1', 10) || 1)
  const { users, total } = listUsers({ q, role, status, page, pageSize: PAGE_SIZE })
  // Protección de datos: el correo completo solo lo ve la administración.
  const showEmail = staff.role === 'admin'

  return (
    <>
      <AdminHeader
        title="Usuarios"
        description={`${total} ${total === 1 ? 'cuenta' : 'cuentas'}. ${showEmail ? '' : 'Los correos se muestran parcialmente: solo la administración los ve completos.'}`}
      />
      <Form id="filtros-usuarios" action="/admin/usuarios" className={styles.filters}>
        <div className="field">
          <label htmlFor="q">Buscar</label>
          <input id="q" name="q" type="search" className="input" defaultValue={q} placeholder="Nombre, correo o carné" />
        </div>
        <div className="field">
          <label htmlFor="rol">Perfil</label>
          <select id="rol" name="rol" className="select" defaultValue={role ?? ''}>
            <option value="">Todos</option>
            <option value="reader">Lectores</option>
            <option value="librarian">Bibliotecarios</option>
            <option value="admin">Administración</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="estado">Estado</label>
          <select id="estado" name="estado" className="select" defaultValue={status ?? ''}>
            <option value="">Todos</option>
            <option value="active">Activas</option>
            <option value="suspended">Suspendidas</option>
          </select>
        </div>
        <button type="submit" className={`btn btn--secondary ${styles.apply}`}>
          Filtrar
        </button>
      </Form>
      <AutoSubmit formId="filtros-usuarios" />

      {users.length ? (
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">Cuentas de la biblioteca</caption>
            <thead>
              <tr>
                <th scope="col">Nombre</th>
                <th scope="col">Correo</th>
                <th scope="col">Carné</th>
                <th scope="col">Perfil</th>
                <th scope="col">Estado</th>
                <th scope="col" className="num">
                  En curso
                </th>
                <th scope="col">Alta</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/admin/usuarios/${u.id}`} className={styles.rowTitle}>
                      {u.name}
                    </Link>
                    {u.isDemo ? <span className="meta"> (demo)</span> : null}
                  </td>
                  <td>{showEmail ? u.email : maskEmail(u.email)}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{u.cardNumber}</td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td>
                    {u.status === 'suspended' ? (
                      <span className="badge badge--danger">Suspendida</span>
                    ) : u.overdueLoans > 0 ? (
                      <span className="badge badge--warning">Con vencidos</span>
                    ) : (
                      <span className="badge badge--success">Activa</span>
                    )}
                  </td>
                  <td className="num">{u.activeLoans}</td>
                  <td>{formatShortDate(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <h2>No hay cuentas con estos filtros</h2>
          <p>Revisa la búsqueda o quita algún filtro.</p>
          <Link href="/admin/usuarios" className="btn btn--secondary">
            Quitar filtros
          </Link>
        </div>
      )}
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        basePath="/admin/usuarios"
        params={{ q: q || undefined, rol: role, estado: status }}
      />
    </>
  )
}
