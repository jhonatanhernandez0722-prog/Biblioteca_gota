import { X } from 'lucide-react'
import type { Metadata } from 'next'
import Form from 'next/form'
import Link from 'next/link'
import { BookCard } from '@/components/books/BookCard'
import { AutoSubmit, CollapseOnMobile } from '@/components/catalog/AutoSubmit'
import { LiveSearch } from '@/components/catalog/LiveSearch'
import { SyncedSelect } from '@/components/catalog/SyncedSelect'
import { Pagination } from '@/components/ui/Pagination'
import { languageName } from '@/lib/languages'
import { isStaff } from '@/lib/status'
import { getCurrentUser } from '@/server/auth/current-user'
import { listCategories, listLanguages, type BookSort } from '@/server/catalog'
import { countCirculatedLoans } from '@/server/circulation'
import { cachedCatalogSearch } from '@/server/search-cache'
import styles from './explorar.module.css'

export const metadata: Metadata = {
  title: 'Explorar libros',
  description: 'Busca en el catálogo de Biblioteca Gota Gota por título, autor, ISBN o tema y filtra por disponibilidad.',
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const SORT_PARAM: Record<string, BookSort> = {
  relevancia: 'relevance',
  titulo: 'title',
  recientes: 'recent',
  populares: 'popular',
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function ExplorePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams
  const q = (first(sp.q) ?? '').trim().slice(0, 120)
  const categoria = first(sp.categoria) || undefined
  const disponible = first(sp.disponibilidad) === 'disponible'
  const idioma = first(sp.idioma) || undefined
  const ordenParam = first(sp.orden) ?? (q ? 'relevancia' : 'titulo')
  const page = Math.max(1, Number.parseInt(first(sp.pagina) ?? '1', 10) || 1)

  const user = await getCurrentUser()
  const categories = (await listCategories()).filter((c) => c.bookCount > 0)
  const languages = await listLanguages()
  const allowPopular = await countCirculatedLoans() >= 5
  const sort = SORT_PARAM[ordenParam] ?? (q ? 'relevance' : 'title')

  const { result, facets } = await cachedCatalogSearch({
    q,
    category: categoria,
    availability: disponible ? 'available' : undefined,
    language: idioma,
    sort: sort === 'popular' && !allowPopular ? 'title' : sort,
    page,
  })
  const catalogTotal = (await cachedCatalogSearch({ pageSize: 1 })).result.total
  // Contadores dinámicos: cada opción dice cuántos libros quedarían si la eligieras.
  const categoryCount = (slug: string) => facets.categories[slug] ?? 0
  const languageCount = (code: string) => facets.languages[code] ?? 0
  const narrowed = Boolean(q || categoria || disponible || idioma)

  const params = {
    q: q || undefined,
    categoria,
    disponibilidad: disponible ? 'disponible' : undefined,
    idioma,
    orden: first(sp.orden),
  }
  const without = (key: keyof typeof params) => {
    const search = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v && k !== key) search.set(k, v)
    const qs = search.toString()
    return qs ? `/explorar?${qs}` : '/explorar'
  }
  const categoryName = categories.find((c) => c.slug === categoria)?.name
  const activeFilters = [
    categoria && { key: 'categoria' as const, label: `Categoría: ${categoryName ?? categoria}` },
    disponible && { key: 'disponibilidad' as const, label: 'Disponibles ahora' },
    idioma && { key: 'idioma' as const, label: `Idioma: ${languageName(idioma)}` },
  ].filter(Boolean) as { key: keyof typeof params; label: string }[]

  return (
    <div className="container">
      <header className={styles.head}>
        <h1>Explorar libros</h1>
        <p className={styles.lead}>
          {catalogTotal} {catalogTotal === 1 ? 'título' : 'títulos'} en el catálogo. Busca por título, autor, ISBN o
          palabras clave.
        </p>
      </header>

      <Form id="catalogo" action="/explorar" className={styles.layout}>
        <div className={styles.searchRow} role="search">
          <LiveSearch
            formId="catalogo"
            defaultValue={q}
            label="Buscar en el catálogo"
            placeholder="Título, autor, ISBN o tema"
            className={styles.searchField}
            iconClassName={styles.searchIcon}
          />
          <button type="submit" className="btn">
            Buscar
          </button>
        </div>

        <details id="filtros" open className={styles.filters}>
          <summary className={styles.summary}>
            Filtros{activeFilters.length ? ` (${activeFilters.length})` : ''}
          </summary>
          <div className={styles.filterBody}>
            <fieldset className={styles.fieldset}>
              <legend>Disponibilidad</legend>
              <label className="check">
                <input type="radio" name="disponibilidad" value="" defaultChecked={!disponible} />
                <span className={styles.option}>
                  Todos los libros
                  <span className={styles.optionCount}>{facets.availability.all}</span>
                </span>
              </label>
              <label className="check" data-empty={!facets.availability.available && !disponible}>
                <input
                  type="radio"
                  name="disponibilidad"
                  value="disponible"
                  defaultChecked={disponible}
                  disabled={!facets.availability.available && !disponible}
                />
                <span className={styles.option}>
                  Disponibles ahora
                  <span className={styles.optionCount}>{facets.availability.available}</span>
                </span>
              </label>
            </fieldset>

            <fieldset className={styles.fieldset}>
              <legend>Categoría</legend>
              <label className="check">
                <input type="radio" name="categoria" value="" defaultChecked={!categoria} />
                Todas
              </label>
              {categories.map((c) => {
                const count = categoryCount(c.slug)
                const empty = count === 0 && categoria !== c.slug
                return (
                  <label key={c.slug} className="check" data-empty={empty}>
                    <input type="radio" name="categoria" value={c.slug} defaultChecked={categoria === c.slug} disabled={empty} />
                    <span className={styles.option}>
                      {c.name}
                      <span className={styles.optionCount}>
                        {narrowed && count !== c.bookCount ? (
                          <>
                            {count}
                            <span className="visually-hidden"> de {c.bookCount}</span>
                          </>
                        ) : (
                          count
                        )}
                      </span>
                    </span>
                  </label>
                )
              })}
            </fieldset>

            {languages.length > 1 ? (
              <fieldset className={styles.fieldset}>
                <legend>Idioma</legend>
                <label className="check">
                  <input type="radio" name="idioma" value="" defaultChecked={!idioma} />
                  Todos
                </label>
                {languages.map((l) => {
                  const count = languageCount(l.code)
                  const empty = count === 0 && idioma !== l.code
                  return (
                    <label key={l.code} className="check" data-empty={empty}>
                      <input type="radio" name="idioma" value={l.code} defaultChecked={idioma === l.code} disabled={empty} />
                      <span className={styles.option}>
                        {languageName(l.code)}
                        <span className={styles.optionCount}>{count}</span>
                      </span>
                    </label>
                  )
                })}
              </fieldset>
            ) : null}

            <button type="submit" className={`btn btn--secondary btn--block ${styles.apply}`}>
              Aplicar filtros
            </button>
          </div>
        </details>

        <section className={styles.results} aria-labelledby="resultados">
          <div className={styles.toolbar}>
            <h2 id="resultados" className={styles.count} aria-live="polite">
              {result.total} {result.total === 1 ? 'resultado' : 'resultados'}
              {q ? ` para «${q}»` : ''}
            </h2>
            <div className={styles.sort}>
              <label htmlFor="orden">Ordenar por</label>
              <SyncedSelect id="orden" name="orden" className="select" value={ordenParam}>
                {q ? <option value="relevancia">Relevancia</option> : null}
                <option value="titulo">Título (A–Z)</option>
                <option value="recientes">Llegadas recientes</option>
                {allowPopular ? <option value="populares">Más pedidos</option> : null}
              </SyncedSelect>
            </div>
          </div>

          {activeFilters.length ? (
            <ul role="list" className={styles.active} aria-label="Filtros activos">
              {activeFilters.map((f) => (
                <li key={f.key}>
                  <Link href={without(f.key)} className="chip" aria-label={`Quitar filtro ${f.label}`}>
                    {f.label}
                    <X aria-hidden="true" width={14} height={14} style={{ marginLeft: 6 }} />
                  </Link>
                </li>
              ))}
              <li>
                <Link href={q ? `/explorar?q=${encodeURIComponent(q)}` : '/explorar'} className="link">
                  Quitar todos
                </Link>
              </li>
            </ul>
          ) : null}

          {result.items.length ? (
            <ul role="list" className={styles.grid}>
              {result.items.map((book) => (
                <li key={book.id}>
                  <BookCard book={book} sizes="(max-width: 640px) 45vw, (max-width: 1100px) 30vw, 210px" />
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              <h3>{q ? `No encontramos libros para «${q}»` : 'Ningún libro cumple estos filtros'}</h3>
              <p>
                Prueba con el apellido del autor, con una sola palabra del título o con el ISBN sin guiones.
                {activeFilters.length ? ' También puedes quitar algún filtro.' : ''}
              </p>
              <div className={styles.emptyActions}>
                <Link href="/explorar" className="btn btn--secondary">
                  Ver todo el catálogo
                </Link>
                {user && isStaff(user.role) && q ? (
                  <Link href={`/admin/libros/importar?q=${encodeURIComponent(q)}`} className="btn btn--ghost">
                    Buscar «{q}» en Open Library
                  </Link>
                ) : null}
              </div>
            </div>
          )}

          <Pagination page={result.page} pageCount={result.pageCount} basePath="/explorar" params={params} />
        </section>
      </Form>
      <AutoSubmit formId="catalogo" />
      <CollapseOnMobile detailsId="filtros" />
    </div>
  )
}
