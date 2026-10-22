import { CircleAlert, CircleCheck } from 'lucide-react'
import Link from 'next/link'
import { AdminHeader } from '@/components/admin/AdminPage'
import { Pagination } from '@/components/ui/Pagination'
import { formatDateTime } from '@/lib/dates'
import { LEGAL_DOCUMENTS, type LegalSlug } from '@/lib/legal'
import { requireAdmin } from '@/server/auth/current-user'
import { listConsentRecords, verifyConsentChain } from '@/server/consents'

export const metadata = { title: 'Evidencias de consentimiento' }

const RESULT: Record<string, { label: string; tone: string }> = {
  accepted: { label: 'Aceptado', tone: 'success' },
  rejected: { label: 'Rechazado', tone: 'warning' },
  revoked: { label: 'Revocado', tone: 'danger' },
}

const PAGE_SIZE = 50

/** Solo administración. Muestra el identificador de cuenta, no el correo: lo necesario para demostrar la aceptación. */
export default async function ConsentsPage({ searchParams }: { searchParams: Promise<{ usuario?: string; pagina?: string }> }) {
  await requireAdmin('/admin/consentimientos')
  const sp = await searchParams
  const userId = Number.parseInt(sp.usuario ?? '', 10) || undefined
  const page = Math.max(1, Number.parseInt(sp.pagina ?? '1', 10) || 1)
  const { records, total } = listConsentRecords({ userId, page, pageSize: PAGE_SIZE })
  const chain = verifyConsentChain()

  return (
    <>
      <AdminHeader
        title="Evidencias de consentimiento"
        description="Registro de solo inserción: la base de datos impide modificar o borrar filas y cada una encadena el hash de la anterior."
      />
      <div className={`alert ${chain.ok ? 'alert--success' : 'alert--danger'}`} style={{ marginBottom: 24 }} role="status">
        {chain.ok ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
        <p>
          {chain.ok
            ? `Cadena íntegra: ${chain.checked} registros verificados.`
            : `La cadena se rompe en el registro ${chain.brokenAt}: alguien modificó los datos por fuera de la aplicación.`}
        </p>
      </div>
      {userId ? (
        <p style={{ marginBottom: 16 }}>
          Mostrando la cuenta #{userId}. <Link href="/admin/consentimientos" className="link">Ver todas</Link>
        </p>
      ) : null}
      {records.length ? (
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">Registros de consentimiento</caption>
            <thead>
              <tr>
                <th scope="col">Fecha (UTC)</th>
                <th scope="col">Cuenta</th>
                <th scope="col">Documento</th>
                <th scope="col">Resultado</th>
                <th scope="col">Proceso</th>
                <th scope="col">Evento</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {r.recordedAt.replace('T', ' ').slice(0, 19)}
                    <span className="meta" style={{ display: 'block' }}>{formatDateTime(r.recordedAt)}</span>
                  </td>
                  <td>
                    {r.userId ? <Link href={`/admin/consentimientos?usuario=${r.userId}`} className="link">#{r.userId}</Link> : '—'}
                  </td>
                  <td>
                    {LEGAL_DOCUMENTS[r.documentSlug as LegalSlug]?.title ?? r.documentSlug}
                    <span className="meta" style={{ display: 'block' }}>
                      v{r.documentVersion}, vigente desde {r.documentEffectiveAt}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge--${RESULT[r.result]?.tone}`}>{RESULT[r.result]?.label}</span>
                    {r.supersedesId ? <span className="meta" style={{ display: 'block' }}>sustituye a #{r.supersedesId}</span> : null}
                  </td>
                  <td>{r.source}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums', fontSize: 12 }}>{r.eventId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <h2>Sin registros todavía</h2>
          <p>Aparecerán cuando alguien cree una cuenta o acepte una nueva versión de los documentos.</p>
        </div>
      )}
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        basePath="/admin/consentimientos"
        params={{ usuario: userId ? String(userId) : undefined }}
      />
    </>
  )
}
