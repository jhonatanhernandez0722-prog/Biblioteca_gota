import Link from 'next/link'
import { AdminHeader, TabLinks } from '@/components/admin/AdminPage'
import { Pagination } from '@/components/ui/Pagination'
import { formatDateTime } from '@/lib/dates'
import { requireStaff } from '@/server/auth/current-user'
import { AUDIT_ENTITY_LABEL, describeAudit, listAudit } from '@/server/audit'

export const metadata = { title: 'Actividad' }

const PAGE_SIZE = 40

const ENTITY_LINK: Record<string, (id: number) => string> = {
  book: (id) => `/admin/libros/${id}`,
  user: (id) => `/admin/usuarios/${id}`,
}

export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ tipo?: string; pagina?: string }> }) {
  await requireStaff('/admin/actividad')
  const sp = await searchParams
  const tipo = sp.tipo && AUDIT_ENTITY_LABEL[sp.tipo] ? sp.tipo : undefined
  const page = Math.max(1, Number.parseInt(sp.pagina ?? '1', 10) || 1)
  const { entries, total } = await listAudit({ page, pageSize: PAGE_SIZE, entityType: tipo })

  const tabs = [
    { key: 'todo', label: 'Todo', href: '/admin/actividad' },
    ...Object.entries(AUDIT_ENTITY_LABEL).map(([key, label]) => ({ key, label, href: `/admin/actividad?tipo=${key}` })),
  ]

  return (
    <>
      <AdminHeader
        title="Actividad"
        description="Registro de las operaciones sobre fichas, ejemplares, préstamos, reservas y cuentas. No se puede editar."
      />
      <div style={{ marginBottom: 16 }}>
        <TabLinks tabs={tabs} current={tipo ?? 'todo'} label="Filtrar actividad" />
      </div>
      {entries.length ? (
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">Registro de operaciones</caption>
            <thead>
              <tr>
                <th scope="col">Cuándo</th>
                <th scope="col">Qué pasó</th>
                <th scope="col">Ámbito</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const link = entry.entityId ? ENTITY_LINK[entry.entityType]?.(entry.entityId) : undefined
                return (
                  <tr key={entry.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(entry.createdAt)}</td>
                    <td>{describeAudit(entry)}</td>
                    <td>
                      {link ? (
                        <Link href={link} className="link">
                          {AUDIT_ENTITY_LABEL[entry.entityType] ?? entry.entityType}
                        </Link>
                      ) : (
                        (AUDIT_ENTITY_LABEL[entry.entityType] ?? entry.entityType)
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <h2>Sin actividad registrada</h2>
          <p>Las operaciones del equipo y de los lectores aparecerán aquí.</p>
        </div>
      )}
      <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} basePath="/admin/actividad" params={{ tipo }} />
    </>
  )
}
