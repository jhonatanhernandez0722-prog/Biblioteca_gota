import { ExternalLink, Pencil } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AvailabilityBadge } from '@/components/books/AvailabilityBadge'
import { BookCard } from '@/components/books/BookCard'
import { BookCover } from '@/components/books/BookCover'
import { BookRail, BookRailItem } from '@/components/books/BookRail'
import { PaceCalculator } from '@/components/books/PaceCalculator'
import { ShareButton } from '@/components/books/ShareButton'
import { formatDate } from '@/lib/dates'
import { languageName } from '@/lib/languages'
import { LOAN_RULES } from '@/lib/rules'
import { COPY_CONDITION, COPY_STATUS, isStaff } from '@/lib/status'
import { joinAuthors, truncate } from '@/lib/text'
import { getCurrentUser } from '@/server/auth/current-user'
import { getBookBySlug, getRelatedBooks, listCopies } from '@/server/catalog'
import { expireStalePickups, getBookCirculation } from '@/server/circulation'
import { BorrowPanel } from './BorrowPanel'
import styles from './book.module.css'

type Params = Promise<{ slug: string }>

const PROVIDER_LABEL: Record<string, { name: string }> = {
  openlibrary: { name: 'Open Library' },
  googlebooks: { name: 'Google Books' },
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const book = await getBookBySlug(slug)
  if (!book) return { title: 'Libro no encontrado' }
  const description = truncate(
    book.description ?? `${book.title}, de ${joinAuthors(book.authors)}. Disponible en Biblioteca Gota Gota.`,
    180,
  )
  return {
    title: `${book.title}, de ${joinAuthors(book.authors)}`,
    description,
    openGraph: { title: book.title, description, type: 'book' },
    twitter: { card: 'summary_large_image', title: book.title, description },
  }
}

export default async function BookPage({ params }: { params: Params }) {
  const { slug } = await params
  const user = await getCurrentUser()
  const staff = isStaff(user?.role)
  await expireStalePickups()
  const book = await getBookBySlug(slug, { includeArchived: staff })
  if (!book) notFound()

  const related = await getRelatedBooks(book, 10)
  const copies = staff ? await listCopies(book.id) : []
  const circulation = staff ? await getBookCirculation(book.id) : null
  const mainCategory = book.categories[0]
  const source = PROVIDER_LABEL[book.sourceProvider]

  return (
    <div className="container">
      <nav aria-label="Ruta de navegación" className={styles.crumbs}>
        <ol>
          <li>
            <Link href="/explorar">Explorar</Link>
          </li>
          {mainCategory ? (
            <li>
              <Link href={`/explorar?categoria=${mainCategory.slug}`}>{mainCategory.name}</Link>
            </li>
          ) : null}
          <li aria-current="page">{book.title}</li>
        </ol>
      </nav>

      <article className={styles.layout}>
        <div className={styles.aside}>
          <BookCover
            title={book.title}
            authors={book.authors}
            coverKey={book.coverKey}
            coverColor={book.coverColor}
            sizes="(max-width: 760px) 70vw, 340px"
            alt={`Portada de ${book.title}`}
            preload
            className={styles.cover}
          />
          <div className={styles.asideActions}>
            <ShareButton
              title={book.title}
              text={`${book.title}, de ${joinAuthors(book.authors)}, en Biblioteca Gota Gota`}
              path={`/libros/${book.slug}`}
            />
            {staff ? (
              <Link href={`/admin/libros/${book.id}`} className="btn btn--ghost btn--sm">
                <Pencil aria-hidden="true" />
                Editar ficha
              </Link>
            ) : null}
          </div>
        </div>

        <div className={styles.main}>
          <header className={styles.header}>
            {book.categories.length ? (
              <ul role="list" className={styles.chips} aria-label="Categorías">
                {book.categories.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/explorar?categoria=${c.slug}`} className="chip">
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <h1 className={styles.title}>{book.title}</h1>
            {book.subtitle ? <p className={styles.subtitle}>{book.subtitle}</p> : null}
            <p className={styles.authors}>
              {book.authors.length
                ? book.authors.map((author, i) => (
                    <span key={author}>
                      {i > 0 ? (i === book.authors.length - 1 ? ' y ' : ', ') : ''}
                      <Link href={`/explorar?q=${encodeURIComponent(author)}`}>{author}</Link>
                    </span>
                  ))
                : 'Autoría desconocida'}
            </p>
            <div className={styles.badges}>
              <AvailabilityBadge
                available={book.availableCopies}
                total={book.totalCopies}
                waiting={book.waitingReservations}
                showCount={Boolean(user)}
              />
              {book.status === 'archived' ? <span className="badge badge--danger">Archivado</span> : null}
            </div>
          </header>

          <div className={styles.columns}>
            <div className={styles.text}>
              {book.description ? (
                <section aria-labelledby="sinopsis">
                  <h2 id="sinopsis" className={styles.blockTitle}>
                    Sinopsis
                  </h2>
                  <div className={styles.description}>
                    {book.description.split(/\n{2,}/).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                </section>
              ) : null}

              <section aria-labelledby="ficha" className={styles.record}>
                <h2 id="ficha" className={styles.blockTitle}>
                  Ficha del libro
                </h2>
                <dl className={styles.dl}>
                  <div>
                    <dt>Autoría</dt>
                    <dd>{joinAuthors(book.authors)}</dd>
                  </div>
                  {book.publisher ? (
                    <div>
                      <dt>Editorial</dt>
                      <dd>{book.publisher}</dd>
                    </div>
                  ) : null}
                  {book.publishedYear ? (
                    <div>
                      <dt>Año de la edición</dt>
                      <dd>{book.publishedYear}</dd>
                    </div>
                  ) : null}
                  {book.isbn13 ? (
                    <div>
                      <dt>ISBN-13</dt>
                      <dd className={styles.mono}>{book.isbn13}</dd>
                    </div>
                  ) : null}
                  {book.isbn10 ? (
                    <div>
                      <dt>ISBN-10</dt>
                      <dd className={styles.mono}>{book.isbn10}</dd>
                    </div>
                  ) : null}
                  {book.pageCount ? (
                    <div>
                      <dt>Páginas</dt>
                      <dd>{book.pageCount}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Idioma</dt>
                    <dd>{languageName(book.language)}</dd>
                  </div>
                  {book.callNumber ? (
                    <div>
                      <dt>Signatura</dt>
                      <dd className={styles.mono}>{book.callNumber}</dd>
                    </div>
                  ) : null}
                  {book.keywords ? (
                    <div>
                      <dt>Temas</dt>
                      <dd>{book.keywords}</dd>
                    </div>
                  ) : null}
                  {staff ? (
                    <div>
                      <dt>Ejemplares</dt>
                      <dd>
                        {book.totalCopies} en total, {circulation?.copies.available ?? 0} en estantería
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>En la biblioteca desde</dt>
                    <dd>{formatDate(book.createdAt)}</dd>
                  </div>
                </dl>
                {source && book.sourceUrl ? (
                  <p className={styles.source}>
                    Datos bibliográficos:{' '}
                    <a href={book.sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
                      {source.name}
                      <ExternalLink aria-hidden="true" width={14} height={14} style={{ display: 'inline', marginLeft: 4 }} />
                      <span className="visually-hidden"> (se abre en otra pestaña)</span>
                    </a>
                  </p>
                ) : null}
              </section>
            </div>

            <div className={styles.side}>
              <BorrowPanel book={book} user={user} />

              <section aria-labelledby="condiciones" className={styles.conditions}>
                <h2 id="condiciones" className={styles.blockTitle}>
                  Condiciones de préstamo
                </h2>
                <ul role="list">
                  <li>
                    <strong>{LOAN_RULES.loanDays} días</strong> desde que lo recoges.
                  </li>
                  <li>
                    <strong>{LOAN_RULES.maxRenewals} renovaciones</strong> si nadie lo está esperando.
                  </li>
                  <li>
                    <strong>{LOAN_RULES.pickupDays} días</strong> para recogerlo una vez apartado.
                  </li>
                </ul>
                <Link href="/condiciones" className="link">
                  Leer todas las condiciones
                </Link>
              </section>
            </div>
          </div>

          {book.pageCount ? (
            <section aria-labelledby="ritmo" className={styles.pace}>
              <h2 id="ritmo" className={styles.blockTitle}>
                ¿Cuánto tardarías en leerlo?
              </h2>
              <PaceCalculator
                title={book.title}
                pageCount={book.pageCount}
                loanDays={LOAN_RULES.loanDays}
                maxRenewals={LOAN_RULES.maxRenewals}
              />
            </section>
          ) : null}

          {staff ? (
            <section aria-labelledby="ejemplares" className={styles.copies}>
              <div className={styles.copiesHead}>
                <h2 id="ejemplares" className={styles.blockTitle}>
                  Ejemplares físicos
                </h2>
                <Link href={`/admin/libros/${book.id}#ejemplares`} className="link">
                  Gestionar ejemplares
                </Link>
              </div>
              {copies.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">Código</th>
                        <th scope="col">Ubicación</th>
                        <th scope="col">Estado físico</th>
                        <th scope="col">Situación</th>
                      </tr>
                    </thead>
                    <tbody>
                      {copies.map((copy) => (
                        <tr key={copy.id}>
                          <td className={styles.mono}>{copy.code}</td>
                          <td>{copy.location ?? 'Sin ubicación'}</td>
                          <td>{COPY_CONDITION[copy.condition]}</td>
                          <td>
                            <span className={`badge badge--${COPY_STATUS[copy.status].tone}`}>
                              {COPY_STATUS[copy.status].label}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">Este título aún no tiene ejemplares registrados.</p>
              )}
            </section>
          ) : null}
        </div>
      </article>

      {related.length ? (
        <section aria-labelledby="relacionados" className={styles.related}>
          <h2 id="relacionados">Si te interesa este libro</h2>
          <BookRail label="Libros relacionados">
            {related.map((b) => (
              <BookRailItem key={b.id}>
                <BookCard book={b} sizes="196px" />
              </BookRailItem>
            ))}
          </BookRail>
        </section>
      ) : null}
    </div>
  )
}
