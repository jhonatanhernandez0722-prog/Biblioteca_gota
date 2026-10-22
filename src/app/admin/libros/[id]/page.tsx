import { Archive, ArchiveRestore, ExternalLink, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { deleteBookAction, setBookStatusAction } from '@/actions/admin'
import { AdminHeader, Panel } from '@/components/admin/AdminPage'
import { BookForm } from '@/components/admin/BookForm'
import { valuesFromBook } from '@/components/admin/book-form-values'
import { AddCopiesForm, CopiesTable } from '@/components/admin/CopyManager'
import { ActionButton, ConfirmAction } from '@/components/ui/ConfirmAction'
import { formatDateTime } from '@/lib/dates'
import { requireStaff } from '@/server/auth/current-user'
import { describeAudit, listAudit } from '@/server/audit'
import { getBookById, listCategories, listCopies } from '@/server/catalog'
import { getBookCirculation } from '@/server/circulation'
import styles from './edit.module.css'

export const metadata = { title: 'Editar libro' }

export default async function EditBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params
  await requireStaff(`/admin/libros/${rawId}`)
  const id = Number.parseInt(rawId, 10)
  const book = Number.isInteger(id) && id > 0 ? await getBookById(id) : null
  if (!book) notFound()

  const copies = await listCopies(book.id)
  const circulation = await getBookCirculation(book.id)
  const history = await listAudit({ page: 1, pageSize: 6, entityType: 'book', entityId: book.id })
  const categories = (await listCategories()).map((c) => ({ slug: c.slug, name: c.name }))

  return (
    <>
      <AdminHeader
        title={book.title}
        description={
          book.status === 'archived'
            ? 'Archivado: no aparece en el catálogo público.'
            : `${book.totalCopies} ${book.totalCopies === 1 ? 'ejemplar' : 'ejemplares'}, ${circulation.copies.available ?? 0} en estantería.`
        }
        back={{ href: '/admin/libros', label: 'Libros' }}
        actions={
          book.status === 'active' ? (
            <Link href={`/libros/${book.slug}`} className="btn btn--secondary">
              <ExternalLink aria-hidden="true" />
              Ver en la web
            </Link>
          ) : null
        }
      />

      <Panel id="ejemplares" title="Ejemplares físicos" description="Cada ejemplar tiene su código y su propia situación de préstamo.">
        <AddCopiesForm bookId={book.id} />
        <CopiesTable copies={copies} />
        <dl className={styles.stats}>
          <div>
            <dt>Solicitudes pendientes</dt>
            <dd>{circulation.pending}</dd>
          </div>
          <div>
            <dt>En lista de espera</dt>
            <dd>{circulation.waiting}</dd>
          </div>
          <div>
            <dt>Prestados</dt>
            <dd>{circulation.copies.on_loan ?? 0}</dd>
          </div>
          <div>
            <dt>Apartados</dt>
            <dd>{circulation.copies.reserved ?? 0}</dd>
          </div>
        </dl>
      </Panel>

      <div className={styles.layout}>
        <div className={styles.main}>
          <BookForm
            bookId={book.id}
            initial={valuesFromBook(book)}
            categories={categories}
            currentCover={book.coverKey ? { url: `/media/covers/${book.coverKey}` } : null}
          />
        </div>

        <div className={styles.side}>


          <Panel id="historial" title="Historial de la ficha">
            {history.entries.length ? (
              <ol className={styles.history}>
                {history.entries.map((entry) => (
                  <li key={entry.id}>
                    <p>{describeAudit(entry)}</p>
                    <p className="meta">{formatDateTime(entry.createdAt)}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">Sin cambios registrados.</p>
            )}
          </Panel>

          <Panel id="zona" title="Archivar o eliminar">
            <p className="meta">
              Archivar oculta el libro del catálogo y conserva su historial. Eliminar solo es posible si nunca tuvo préstamos.
            </p>
            <div className={styles.danger}>
              {book.status === 'active' ? (
                <ConfirmAction
                  action={setBookStatusAction}
                  hidden={{ bookId: book.id, status: 'archived' }}
                  triggerLabel="Archivar"
                  triggerIcon={<Archive aria-hidden="true" />}
                  triggerClassName="btn btn--secondary btn--sm"
                  title={`¿Archivar «${book.title}»?`}
                  description={
                    <p>
                      Dejará de aparecer en el catálogo y se cancelarán sus reservas en espera. No se puede archivar con
                      préstamos en curso.
                    </p>
                  }
                  confirmLabel="Archivar"
                  confirmClassName="btn"
                />
              ) : (
                <ActionButton action={setBookStatusAction} hidden={{ bookId: book.id, status: 'active' }} className="btn btn--secondary btn--sm">
                  <ArchiveRestore aria-hidden="true" />
                  Recuperar del archivo
                </ActionButton>
              )}
              <ConfirmAction
                action={deleteBookAction}
                hidden={{ bookId: book.id }}
                triggerLabel="Eliminar ficha"
                triggerIcon={<Trash2 aria-hidden="true" />}
                triggerClassName="btn btn--danger-ghost btn--sm"
                title={`¿Eliminar «${book.title}» definitivamente?`}
                description={
                  <p>
                    Se borrarán la ficha, sus ejemplares y su portada. Esta acción no se puede deshacer. Si el libro tuvo
                    préstamos, archívalo en su lugar.
                  </p>
                }
                confirmLabel="Eliminar definitivamente"
              />
            </div>
          </Panel>
        </div>
      </div>
    </>
  )
}
