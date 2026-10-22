import { Import, Plus } from 'lucide-react'
import Form from 'next/form'
import Link from 'next/link'
import { AdminHeader } from '@/components/admin/AdminPage'
import { BookCover } from '@/components/books/BookCover'
import { AutoSubmit } from '@/components/catalog/AutoSubmit'
import { Pagination } from '@/components/ui/Pagination'
import { formatShortDate } from '@/lib/dates'
import { joinAuthors } from '@/lib/text'
import { listCategories, searchBooks, type BookSort } from '@/server/catalog'
import styles from '../table-page.module.css'

export const metadata = { title: 'Libros' }

type SearchParams = Promise<Record<string, string | undefined>>

const SORTS: Record<string, BookSort> = { titulo: 'title', recientes: 'recent', populares: 'popular' }

export default async function AdminBooksPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = sp.q?.trim().slice(0, 120) ?? ''
  const estado = sp.estado === 'archivados' ? 'archived' : sp.estado === 'todos' ? 'all' : 'active'
  const categoria = sp.categoria || undefined
  const disponibles = sp.disponibilidad === 'disponible'
  const orden = sp.orden && SORTS[sp.orden] ? sp.orden : 'recientes'
  const page = Math.max(1, Number.parseInt(sp.pagina ?? '1', 10) || 1)

  const result = await searchBooks({
    q,
    status: estado,
    category: categoria,
    availability: disponibles ? 'available' : undefined,
    sort: q ? 'relevance' : SORTS[orden],
    page,
    pageSize: 25,
  })
  const categories = await listCategories()

  return (
    <>
      <AdminHeader
        title="Libros"
        description={`${result.total} ${result.total === 1 ? 'ficha' : 'fichas'} con estos filtros. Cada ficha es un título; los ejemplares físicos se gestionan dentro.`}
        actions={
          <>
            <Link href="/admin/libros/importar" className="btn">
              <Import aria-hidden="true" />
              Importar por ISBN o título
            </Link>
            <Link href="/admin/libros/nuevo" className="btn btn--secondary">
              <Plus aria-hidden="true" />
              Ficha manual
            </Link>
          </>
        }
      />

      <Form id="filtros-libros" action="/admin/libros" className={styles.filters}>
        <div className="field">
          <label htmlFor="q">Buscar</label>
          <input id="q" name="q" type="search" className="input" defaultValue={q} placeholder="Título, autor o ISBN" />
        </div>
        <div className="field">
          <label htmlFor="estado">Estado</label>
          <select id="estado" name="estado" className="select" defaultValue={sp.estado ?? 'activos'}>
            <option value="activos">Activos</option>
            <option value="archivados">Archivados</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="categoria">Categoría</label>
          <select id="categoria" name="categoria" className="select" defaultValue={categoria ?? ''}>
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="disponibilidad">Disponibilidad</label>
          <select id="disponibilidad" name="disponibilidad" className="select" defaultValue={disponibles ? 'disponible' : ''}>
            <option value="">Todas</option>
            <option value="disponible">Con ejemplares libres</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="orden">Ordenar</label>
          <select id="orden" name="orden" className="select" defaultValue={orden}>
            <option value="recientes">Llegadas recientes</option>
            <option value="titulo">Título (A–Z)</option>
            <option value="populares">Más pedidos</option>
          </select>
        </div>
        <button type="submit" className={`btn btn--secondary ${styles.apply}`}>
          Filtrar
        </button>
      </Form>
      <AutoSubmit formId="filtros-libros" />

      {result.items.length ? (
        <div className="table-wrap">
          <table className="table">
            <caption className="visually-hidden">Fichas del catálogo</caption>
            <thead>
              <tr>
                <th scope="col">Libro</th>
                <th scope="col">Categoría</th>
                <th scope="col" className="num">
                  Ejemplares
                </th>
                <th scope="col">Estado</th>
                <th scope="col">Llegó</th>
                <th scope="col" className="actions">
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((book) => (
                <tr key={book.id}>
                  <td>
                    <div className={styles.bookCell}>
                      <BookCover
                        title={book.title}
                        authors={book.authors}
                        coverKey={book.coverKey}
                        coverColor={book.coverColor}
                        sizes="40px"
                        className={styles.thumb}
                      />
                      <div>
                        <Link href={`/admin/libros/${book.id}`} className={styles.rowTitle}>
                          {book.title}
                        </Link>
                        <p className="meta">{joinAuthors(book.authors)}</p>
                      </div>
                    </div>
                  </td>
                  <td>{book.categories.map((c) => c.name).join(', ') || '—'}</td>
                  <td className="num">
                    {book.availableCopies} / {book.totalCopies}
                    <span className="visually-hidden"> libres del total</span>
                  </td>
                  <td>
                    {book.status === 'archived' ? (
                      <span className="badge">Archivado</span>
                    ) : book.totalCopies === 0 ? (
                      <span className="badge badge--warning">Sin ejemplares</span>
                    ) : (
                      <span className="badge badge--success">Activo</span>
                    )}
                  </td>
                  <td>{formatShortDate(book.createdAt)}</td>
                  <td className="actions">
                    <Link href={`/admin/libros/${book.id}`} className="btn btn--secondary btn--sm">
                      Editar
                    </Link>{' '}
                    {book.status === 'active' ? (
                      <Link href={`/libros/${book.slug}`} className="btn btn--ghost btn--sm">
                        Ver
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <h2>No hay fichas con estos filtros</h2>
          <p>{q ? `Ninguna ficha coincide con «${q}». ¿Quieres buscarla en Open Library para importarla?` : 'Prueba a cambiar los filtros.'}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {q ? (
              <Link href={`/admin/libros/importar?q=${encodeURIComponent(q)}`} className="btn">
                Buscar «{q}» para importar
              </Link>
            ) : null}
            <Link href="/admin/libros" className="btn btn--secondary">
              Quitar filtros
            </Link>
          </div>
        </div>
      )}

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        basePath="/admin/libros"
        params={{ q: q || undefined, estado: sp.estado, categoria, disponibilidad: sp.disponibilidad, orden: sp.orden }}
      />
    </>
  )
}
