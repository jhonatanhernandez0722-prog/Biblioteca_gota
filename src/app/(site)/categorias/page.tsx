import type { Metadata } from 'next'
import Form from 'next/form'
import Link from 'next/link'
import { BookCover } from '@/components/books/BookCover'
import { AutoSubmit } from '@/components/catalog/AutoSubmit'
import { LiveSearch } from '@/components/catalog/LiveSearch'
import { getCategoryIndex, searchBooks } from '@/server/catalog'
import { cachedCatalogSearch } from '@/server/search-cache'
import styles from './categorias.module.css'

export const metadata: Metadata = {
  title: 'Categorías',
  description: 'Explora el catálogo de Biblioteca Gota Gota por categorías: novela, poesía, ensayo, teatro y más.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function CategoriesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = (first(sp.q) ?? '').trim().slice(0, 120)
  const disponible = first(sp.disponibilidad) === 'disponible'
  const filters = { q: q || undefined, availability: disponible ? ('available' as const) : undefined }
  const filtered = Boolean(q || disponible)

  const all = await getCategoryIndex()
  // Contadores dinámicos: cuántos títulos de cada categoría cumplen la búsqueda y los filtros.
  const { facets } = await cachedCatalogSearch({ ...filters, pageSize: 1 })
  const categories = all
    .map((c) => ({ ...c, matching: filtered ? (facets.categories[c.slug] ?? 0) : c.bookCount }))
    .filter((c) => c.matching > 0)
    .sort((a, b) => b.matching - a.matching || a.name.localeCompare(b.name, 'es'))
  const totalMatching = filtered ? facets.availability[disponible ? 'available' : 'all'] : null

  const exploreHref = (slug: string) => {
    const params = new URLSearchParams({ categoria: slug })
    if (q) params.set('q', q)
    if (disponible) params.set('disponibilidad', 'disponible')
    return `/explorar?${params}`
  }

  return (
    <div className="container">
      <header className={styles.head}>
        <h1>Categorías</h1>
        <p className={styles.lead}>
          {all.length} categorías, con los títulos que la biblioteca tiene hoy. Un libro puede estar en varias.
        </p>
      </header>

      {all.length ? (
        <Form id="filtro-categorias" action="/categorias" className={styles.filters} role="search">
          <LiveSearch
            formId="filtro-categorias"
            defaultValue={q}
            label="Filtrar categorías por título, autor o tema"
            placeholder="Filtra por título, autor o tema"
            className={styles.searchField}
            iconClassName={styles.searchIcon}
          />
          <label className="check">
            <input type="checkbox" name="disponibilidad" value="disponible" defaultChecked={disponible} />
            Solo disponibles ahora
          </label>
          <button type="submit" className={`btn btn--secondary ${styles.apply}`}>
            Filtrar
          </button>
          <p id="resultados" className={styles.summary} aria-live="polite">
            {filtered
              ? `${totalMatching} ${totalMatching === 1 ? 'título' : 'títulos'} en ${categories.length} ${categories.length === 1 ? 'categoría' : 'categorías'}`
              : 'Escribe para ver cuántos títulos de cada categoría coinciden.'}
          </p>
        </Form>
      ) : null}
      <AutoSubmit formId="filtro-categorias" />

      {all.length === 0 ? (
        <div className="empty">
          <h2>Todavía no hay categorías con libros</h2>
          <p>Cuando el equipo añada libros al catálogo, aparecerán aquí agrupados por tema.</p>
          <Link href="/explorar" className="btn">
            Ver el catálogo
          </Link>
        </div>
      ) : categories.length === 0 ? (
        <div className="empty">
          <h2>Ninguna categoría tiene libros con estos filtros</h2>
          <p>Prueba con otra palabra o quita «Solo disponibles ahora».</p>
          <Link href="/categorias" className="btn btn--secondary">
            Ver todas las categorías
          </Link>
        </div>
      ) : (
        <ul role="list" className={styles.list}>
          {(await Promise.all(categories.map(async (category) => {
            const books = (await searchBooks({ ...filters, category: category.slug, sort: 'recent', pageSize: 5 })).items
            return (
              <li key={category.id} className={styles.item}>
                <div className={styles.text}>
                  <h2 className={styles.name}>
                    <Link href={exploreHref(category.slug)}>{category.name}</Link>
                  </h2>
                  <p className={styles.count}>
                    {filtered && category.matching !== category.bookCount
                      ? `${category.matching} de ${category.bookCount} títulos`
                      : `${category.bookCount} ${category.bookCount === 1 ? 'título' : 'títulos'}`}
                  </p>
                  {category.description ? <p>{category.description}</p> : null}
                </div>
                <ul role="list" className={styles.covers} aria-label={`Algunos títulos de ${category.name}`}>
                  {books.map((book) => (
                    <li key={book.id}>
                      <Link href={`/libros/${book.slug}`} className={styles.coverLink} title={book.title}>
                        <BookCover
                          title={book.title}
                          authors={book.authors}
                          coverKey={book.coverKey}
                          coverColor={book.coverColor}
                          sizes="110px"
                          alt={book.title}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })))}
        </ul>
      )}
    </div>
  )
}
