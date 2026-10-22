'use client'

import { BookCheck, CircleAlert, ExternalLink, RotateCcw, Search, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { DropMark } from '@/components/brand/DropMark'
import { languageName } from '@/lib/languages'
import { BookForm } from './BookForm'
import { EMPTY_BOOK, type BookFormValues } from './book-form-values'
import styles from './ImportWorkbench.module.css'

type Mode = 'auto' | 'isbn' | 'title' | 'author'

interface ProviderInfo {
  id: 'openlibrary' | 'googlebooks'
  label: string
  configured: boolean
  attribution: { name: string; url: string; license: string }
  notice: string | null
}

interface Result {
  provider: ProviderInfo['id']
  providerId: string
  title: string
  subtitle: string | null
  authors: string[]
  year: number | null
  publisher: string | null
  isbn13: string | null
  isbn10: string | null
  language: string | null
  coverUrl: string | null
  coverThumbUrl: string | null
  editionCount: number | null
  inCatalog: { id: number; slug: string; title: string } | null
}

interface Details extends Omit<Result, 'inCatalog'> {
  description: string | null
  descriptionSource: string | null
  pageCount: number | null
  publishedDate: string | null
  subjects: string[]
  sourceUrl: string
}

interface DuplicateMatch {
  id: number
  title: string
  authors: string[]
}

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string; retryAfter?: number | null }
  | { status: 'done'; items: Result[]; total: number; page: number; hasMore: boolean; loadingMore?: boolean }

type DetailState =
  | { status: 'closed' }
  | { status: 'loading'; result: Result }
  | { status: 'error'; result: Result; message: string }
  | { status: 'ready'; result: Result; details: Details; duplicates: { exact: DuplicateMatch[]; similar: DuplicateMatch[] } }

const MODES: { value: Mode; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 'isbn', label: 'ISBN' },
  { value: 'title', label: 'Título' },
  { value: 'author', label: 'Autor' },
]

async function readError(response: Response): Promise<{ message: string; retryAfter?: number | null }> {
  try {
    const body = await response.json()
    return { message: body?.error?.message ?? 'No se pudo completar la consulta.', retryAfter: body?.error?.retryAfter }
  } catch {
    return { message: 'No se pudo completar la consulta.' }
  }
}

function toFormValues(result: Result, details: Details | null): BookFormValues {
  const authors = details?.authors.length ? details.authors : result.authors
  return {
    ...EMPTY_BOOK,
    title: details?.title ?? result.title,
    subtitle: details?.subtitle ?? result.subtitle ?? '',
    authors: authors.join('\n'),
    isbn: details?.isbn13 ?? result.isbn13 ?? details?.isbn10 ?? result.isbn10 ?? '',
    publisher: details?.publisher ?? result.publisher ?? '',
    publishedYear: String(details?.year ?? result.year ?? ''),
    pageCount: details?.pageCount ? String(details.pageCount) : '',
    language: details?.language ?? result.language ?? 'es',
    description: details?.description ?? '',
    descriptionSource: details?.descriptionSource ?? '',
    subjects: details?.subjects ?? [],
    sourceProvider: result.provider,
    sourceRef: result.providerId,
    sourceUrl: details?.sourceUrl ?? '',
    coverUrl: details?.coverUrl ?? result.coverUrl ?? '',
  }
}

function Thumb({ src, title }: { src: string | null; title: string }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div className={styles.thumbFallback} aria-hidden="true">
        <span>{title}</span>
        <DropMark size={16} spine="var(--ink)" ink="var(--paper)" />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- miniatura remota del proveedor (solo vista previa)
    <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className={styles.thumbImg} />
  )
}

export function ImportWorkbench({
  categories,
  providers,
  defaultProvider,
  initialQuery,
}: {
  categories: { slug: string; name: string }[]
  providers: ProviderInfo[]
  defaultProvider: ProviderInfo['id']
  initialQuery?: string
}) {
  const uid = useId()
  const [q, setQ] = useState(initialQuery ?? '')
  const [mode, setMode] = useState<Mode>('auto')
  const [provider, setProvider] = useState<ProviderInfo['id']>(defaultProvider)
  const [search, setSearch] = useState<SearchState>({ status: 'idle' })
  const [detail, setDetail] = useState<DetailState>({ status: 'closed' })
  const [formSeed, setFormSeed] = useState<{ key: number; values: BookFormValues; label?: string }>({
    key: 0,
    values: EMPTY_BOOK,
  })
  const dialog = useRef<HTMLDialogElement>(null)
  const formHeading = useRef<HTMLHeadingElement>(null)
  const searchAbort = useRef<AbortController | null>(null)
  const lastQuery = useRef<{ q: string; mode: Mode; provider: string } | null>(null)
  const [lastSearch, setLastSearch] = useState<{ q: string; mode: Mode; provider: string } | null>(null)
  const activeProvider = providers.find((p) => p.id === provider) ?? providers[0]!

  const runSearch = useCallback(async (query: { q: string; mode: Mode; provider: string }, page = 1) => {
    searchAbort.current?.abort()
    const controller = new AbortController()
    searchAbort.current = controller
    lastQuery.current = query
    setLastSearch(query)
    if (page === 1) setSearch({ status: 'loading' })
    else setSearch((s) => (s.status === 'done' ? { ...s, loadingMore: true } : s))
    try {
      const params = new URLSearchParams({ q: query.q, mode: query.mode, provider: query.provider, page: String(page) })
      const response = await fetch(`/api/admin/metadata/search?${params}`, { signal: controller.signal })
      if (!response.ok) {
        setSearch({ status: 'error', ...(await readError(response)) })
        return
      }
      const data = (await response.json()) as { items: Result[]; total: number; page: number; hasMore: boolean }
      setSearch((s) =>
        page > 1 && s.status === 'done'
          ? { status: 'done', items: [...s.items, ...data.items], total: data.total, page: data.page, hasMore: data.hasMore }
          : { status: 'done', ...data },
      )
    } catch (error) {
      if ((error as Error).name === 'AbortError') return
      setSearch({ status: 'error', message: 'Sin conexión con el servidor. Comprueba tu red y vuelve a intentarlo.' })
    }
  }, [])

  // Búsqueda inicial desde ?q= (por ejemplo, desde el catálogo sin resultados).
  const ranInitial = useRef(false)
  useEffect(() => {
    if (ranInitial.current || !initialQuery || initialQuery.trim().length < 2) return
    ranInitial.current = true
    void runSearch({ q: initialQuery.trim(), mode: 'auto', provider: defaultProvider })
  }, [initialQuery, defaultProvider, runSearch])

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (q.trim().length < 2) {
      setSearch({ status: 'error', message: 'Escribe al menos 2 caracteres: un ISBN, un título o un autor.' })
      return
    }
    void runSearch({ q: q.trim(), mode, provider })
  }

  const openDetails = async (result: Result) => {
    setDetail({ status: 'loading', result })
    if (!dialog.current?.open) dialog.current?.showModal()
    try {
      const params = new URLSearchParams({ id: result.providerId, provider: result.provider })
      const response = await fetch(`/api/admin/metadata/details?${params}`)
      if (!response.ok) {
        setDetail({ status: 'error', result, message: (await readError(response)).message })
        return
      }
      const data = (await response.json()) as {
        details: Details
        duplicates: { exact: DuplicateMatch[]; similar: DuplicateMatch[] }
      }
      setDetail({ status: 'ready', result, details: data.details, duplicates: data.duplicates })
    } catch {
      setDetail({ status: 'error', result, message: 'Sin conexión con el servidor.' })
    }
  }

  const applyData = (result: Result, details: Details | null) => {
    setFormSeed((seed) => ({
      key: seed.key + 1,
      values: toFormValues(result, details),
      label: `${details?.title ?? result.title}`,
    }))
    dialog.current?.close()
    window.setTimeout(() => {
      formHeading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      formHeading.current?.focus({ preventScroll: true })
    }, 50)
  }

  const startManual = () => {
    setFormSeed((seed) => ({ key: seed.key + 1, values: { ...EMPTY_BOOK, title: mode !== 'author' && mode !== 'isbn' ? q : '' } }))
    window.setTimeout(() => formHeading.current?.focus(), 50)
  }

  return (
    <div className={styles.workbench}>
      <section className={styles.searchPane} aria-labelledby={`${uid}-buscar`}>
        <h2 id={`${uid}-buscar`} className={styles.paneTitle}>
          1. Busca el libro
        </h2>
        <form onSubmit={onSubmit} className={styles.searchForm} role="search">
          <div className={styles.searchRow}>
            <label htmlFor={`${uid}-q`} className="visually-hidden">
              ISBN, título o autor
            </label>
            <input
              id={`${uid}-q`}
              type="search"
              className="input"
              placeholder="ISBN, título o autor"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
              enterKeyHint="search"
            />
            <button type="submit" className="btn">
              <Search aria-hidden="true" />
              Buscar
            </button>
          </div>
          <div className={styles.searchOptions}>
            <fieldset className={styles.modes}>
              <legend className="visually-hidden">Buscar por</legend>
              {MODES.map((m) => (
                <label key={m.value} className={styles.mode}>
                  <input type="radio" name="mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} />
                  <span>{m.label}</span>
                </label>
              ))}
            </fieldset>
            {providers.filter((p) => p.configured).length > 1 ? (
              <div className={styles.providerSelect}>
                <label htmlFor={`${uid}-provider`}>Fuente</label>
                <select
                  id={`${uid}-provider`}
                  className="select"
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as ProviderInfo['id'])}
                >
                  {providers
                    .filter((p) => p.configured)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                </select>
              </div>
            ) : null}
          </div>
          {activeProvider.notice ? <p className="field-hint">{activeProvider.notice}</p> : null}
        </form>

        <div aria-live="polite" aria-busy={search.status === 'loading'}>
          {search.status === 'idle' ? (
            <div className={styles.hint}>
              <p>
                Escribe un ISBN para ir directo a una edición, o un título o autor para ver varias. Los datos vienen de{' '}
                <a href={activeProvider.attribution.url} target="_blank" rel="noopener noreferrer" className="link">
                  {activeProvider.attribution.name}
                </a>{' '}
                y no se guarda nada hasta que revises la ficha.
              </p>
            </div>
          ) : null}

          {search.status === 'loading' ? (
            <ul role="list" className={styles.results}>
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className={styles.result}>
                  <div className="skeleton" style={{ aspectRatio: '2 / 3' }} />
                  <div style={{ display: 'grid', gap: 8 }}>
                    <div className="skeleton" style={{ height: 16, width: '80%' }} />
                    <div className="skeleton" style={{ height: 12, width: '55%' }} />
                  </div>
                </li>
              ))}
              <li className="visually-hidden">Buscando…</li>
            </ul>
          ) : null}

          {search.status === 'error' ? (
            <div className="alert alert--danger" role="alert">
              <CircleAlert aria-hidden="true" />
              <div>
                <p>{search.message}</p>
                {search.retryAfter ? <p className="meta">Podrás reintentar en unos {search.retryAfter} s.</p> : null}
                {lastSearch ? (
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    style={{ marginTop: 12 }}
                    onClick={() => lastQuery.current && void runSearch(lastQuery.current)}
                  >
                    <RotateCcw aria-hidden="true" />
                    Reintentar
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          {search.status === 'done' && search.items.length === 0 ? (
            <div className="empty">
              <h3>Sin resultados para «{lastSearch?.q}»</h3>
              <p>
                Comprueba la ortografía, prueba solo con el apellido del autor o busca por ISBN. Si el libro no está en{' '}
                {activeProvider.label}, crea la ficha a mano.
              </p>
              <button type="button" className="btn btn--secondary" onClick={startManual}>
                Rellenar la ficha a mano
              </button>
            </div>
          ) : null}

          {search.status === 'done' && search.items.length > 0 ? (
            <>
              <p className={styles.count}>
                {search.total} {search.total === 1 ? 'resultado' : 'resultados'} en {activeProvider.label}
              </p>
              <ul role="list" className={styles.results}>
                {search.items.map((item) => (
                  <li key={`${item.provider}-${item.providerId}`} className={styles.result}>
                    <button
                      type="button"
                      className={styles.resultCover}
                      onClick={() => void openDetails(item)}
                      aria-label={`Ver detalles de ${item.title}`}
                    >
                      <Thumb src={item.coverThumbUrl} title={item.title} />
                    </button>
                    <div className={styles.resultBody}>
                      <h3 className={styles.resultTitle}>{item.title}</h3>
                      <p className={styles.resultMeta}>
                        {item.authors.slice(0, 2).join(', ') || 'Autoría desconocida'}
                        {item.year ? `, ${item.year}` : ''}
                      </p>
                      {item.publisher ? <p className={styles.resultMeta}>{item.publisher}</p> : null}
                      {item.inCatalog ? (
                        <Link href={`/admin/libros/${item.inCatalog.id}`} className="badge badge--brand">
                          <BookCheck aria-hidden="true" />
                          Ya en el catálogo
                        </Link>
                      ) : null}
                      <div className={styles.resultActions}>
                        <button type="button" className="btn btn--secondary btn--sm" onClick={() => void openDetails(item)}>
                          Ver detalles
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              {search.hasMore ? (
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ marginTop: 24 }}
                  disabled={search.loadingMore}
                  onClick={() => lastQuery.current && void runSearch(lastQuery.current, search.page + 1)}
                >
                  {search.loadingMore ? <span className="spinner" aria-hidden="true" /> : null}
                  Cargar más resultados
                </button>
              ) : null}
            </>
          ) : null}
        </div>
        <p className={styles.attribution}>
          Fuente: {activeProvider.attribution.name} ({activeProvider.attribution.license}). Los datos importados se
          guardan en la base de datos de la biblioteca; el proveedor no gestiona ejemplares ni préstamos.
        </p>
      </section>

      <section className={styles.formPane} aria-labelledby={`${uid}-ficha`}>
        <h2 id={`${uid}-ficha`} ref={formHeading} tabIndex={-1} className={styles.paneTitle}>
          2. Revisa la ficha y guárdala
        </h2>
        {formSeed.key === 0 ? (
          <div className="empty">
            <p>
              Elige un resultado y pulsa <strong>Usar estos datos</strong>: la ficha se rellenará aquí para que la revises.
            </p>
            <button type="button" className="btn btn--ghost" onClick={startManual}>
              O empieza una ficha vacía
            </button>
          </div>
        ) : (
          <>
            {formSeed.label ? (
              <p className="meta" style={{ marginBottom: 16 }}>
                Datos cargados de «{formSeed.label}».
              </p>
            ) : null}
            <BookForm key={formSeed.key} initial={formSeed.values} categories={categories} providerLabel={activeProvider.label} />
          </>
        )}
      </section>

      <dialog
        ref={dialog}
        className={`dialog ${styles.drawer}`}
        aria-labelledby={`${uid}-detalle`}
        onClose={() => setDetail({ status: 'closed' })}
      >
        <div className={styles.drawerInner}>
          <div className={styles.drawerHead}>
            <h2 id={`${uid}-detalle`} className="dialog-title">
              {detail.status === 'closed' ? 'Detalle' : detail.result.title}
            </h2>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => dialog.current?.close()}>
              <X aria-hidden="true" />
              Cerrar
            </button>
          </div>

          {detail.status === 'loading' ? (
            <div aria-busy="true" className={styles.drawerBody}>
              <div className="skeleton" style={{ width: 160, aspectRatio: '2 / 3' }} />
              <div className="skeleton" style={{ height: 18, width: '70%' }} />
              <div className="skeleton" style={{ height: 14, width: '50%' }} />
              <p className="visually-hidden">Cargando detalles…</p>
            </div>
          ) : null}

          {detail.status === 'error' ? (
            <div className={styles.drawerBody}>
              <div className="alert alert--danger" role="alert">
                <CircleAlert aria-hidden="true" />
                <p>{detail.message}</p>
              </div>
              <div className={styles.drawerActions}>
                <button type="button" className="btn btn--secondary" onClick={() => void openDetails(detail.result)}>
                  Reintentar
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => applyData(detail.result, null)}>
                  Usar solo los datos del resultado
                </button>
              </div>
            </div>
          ) : null}

          {detail.status === 'ready' ? (
            <div className={styles.drawerBody}>
              <div className={styles.detailTop}>
                <div className={styles.detailCover}>
                  <Thumb src={detail.details.coverUrl ?? detail.result.coverThumbUrl} title={detail.details.title} />
                </div>
                <dl className={styles.detailFacts}>
                  <div>
                    <dt>Autoría</dt>
                    <dd>{detail.details.authors.join(', ') || detail.result.authors.join(', ') || 'Sin indicar'}</dd>
                  </div>
                  <div>
                    <dt>Editorial y año</dt>
                    <dd>
                      {[detail.details.publisher, detail.details.publishedDate ?? detail.details.year].filter(Boolean).join(', ') ||
                        'Sin indicar'}
                    </dd>
                  </div>
                  <div>
                    <dt>ISBN</dt>
                    <dd>{detail.details.isbn13 ?? detail.result.isbn13 ?? detail.details.isbn10 ?? 'Sin ISBN'}</dd>
                  </div>
                  <div>
                    <dt>Páginas</dt>
                    <dd>{detail.details.pageCount ?? 'Sin indicar'}</dd>
                  </div>
                  <div>
                    <dt>Idioma</dt>
                    <dd>{languageName(detail.details.language ?? detail.result.language)}</dd>
                  </div>
                </dl>
              </div>

              {detail.duplicates.exact.length ? (
                <div className="alert alert--danger">
                  <CircleAlert aria-hidden="true" />
                  <p>
                    Este ISBN ya está en el catálogo como{' '}
                    <Link href={`/admin/libros/${detail.duplicates.exact[0]!.id}`} className="link">
                      «{detail.duplicates.exact[0]!.title}»
                    </Link>
                    . Añade ejemplares a esa ficha en lugar de importarlo otra vez.
                  </p>
                </div>
              ) : detail.duplicates.similar.length ? (
                <div className="alert alert--warning">
                  <CircleAlert aria-hidden="true" />
                  <p>
                    Hay {detail.duplicates.similar.length === 1 ? 'una ficha parecida' : 'fichas parecidas'}:{' '}
                    {detail.duplicates.similar.map((d) => `«${d.title}»`).join(', ')}. Comprueba que sea otra edición.
                  </p>
                </div>
              ) : null}

              {detail.details.description ? (
                <div className={styles.detailText}>
                  <h3 className={styles.detailHeading}>Descripción del proveedor</h3>
                  <p>{detail.details.description}</p>
                </div>
              ) : (
                <p className="meta">El proveedor no tiene descripción para esta edición.</p>
              )}

              {detail.details.subjects.length ? (
                <div className={styles.detailText}>
                  <h3 className={styles.detailHeading}>Temas</h3>
                  <p className={styles.subjects}>
                    {detail.details.subjects.slice(0, 12).map((s) => (
                      <span key={s} className="chip">
                        {s}
                      </span>
                    ))}
                  </p>
                </div>
              ) : null}

              <a href={detail.details.sourceUrl} target="_blank" rel="noopener noreferrer" className="link">
                Ver la ficha en {activeProvider.label}
                <ExternalLink aria-hidden="true" width={14} height={14} style={{ display: 'inline', marginLeft: 4 }} />
                <span className="visually-hidden"> (se abre en otra pestaña)</span>
              </a>

              <div className={styles.drawerActions}>
                <button
                  type="button"
                  className="btn"
                  disabled={detail.duplicates.exact.length > 0}
                  onClick={() => applyData(detail.result, detail.details)}
                >
                  Usar estos datos
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()}>
                  Seguir buscando
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </dialog>
    </div>
  )
}
