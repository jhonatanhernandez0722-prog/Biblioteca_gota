import { looksLikeIsbn, normalizeIsbn } from '@/lib/isbn'
import { normalizeText, similarity, slugify } from '@/lib/text'
import type {
  BookDetail,
  BookStatus,
  BookSummary,
  Category,
  CategoryWithCount,
  Copy,
  CopyCondition,
  CopyStatus,
} from '@/lib/types'
import { logAudit } from './audit'
import { all, get, now, run, transaction, type SqlValue } from './db'
import { DomainError } from './errors'

/* ───────────────────────── Filas y mapeo ───────────────────────── */

interface BookRow {
  id: number
  slug: string
  title: string
  subtitle: string | null
  description: string | null
  publisher: string | null
  published_year: number | null
  isbn13: string | null
  isbn10: string | null
  language: string | null
  page_count: number | null
  call_number: string | null
  keywords: string | null
  cover_key: string | null
  cover_color: string | null
  source_provider: string
  source_ref: string | null
  source_url: string | null
  featured: number
  editorial_pick: number
  editorial_note: string | null
  editorial_quote: string | null
  status: BookStatus
  is_demo: number
  created_at: string
  updated_at: string
  available_copies: number
  total_copies: number
}

/**
 * `available_copies` es lo que un lector puede pedir ahora mismo: ejemplares
 * en estantería menos solicitudes pendientes que ya cuentan con ellos.
 */
const AVAILABILITY_SQL = `
  GREATEST(0,
    (SELECT COUNT(*) FROM copies c WHERE c.book_id = b.id AND c.status = 'available')
    - (SELECT COUNT(*) FROM loans l WHERE l.book_id = b.id AND l.status = 'pending')
  ) AS available_copies,
  (SELECT COUNT(*) FROM copies c WHERE c.book_id = b.id AND c.status NOT IN ('lost','withdrawn')) AS total_copies`

const FREE_COPIES_CONDITION = `
  (SELECT COUNT(*) FROM copies c WHERE c.book_id = b.id AND c.status = 'available')
  > (SELECT COUNT(*) FROM loans l WHERE l.book_id = b.id AND l.status = 'pending')`

const BOOK_SELECT = `SELECT b.*, ${AVAILABILITY_SQL} FROM books b`

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(',')
}

async function loadRelations(ids: number[]) {
  const authors = new Map<number, string[]>()
  const categories = new Map<number, { slug: string; name: string }[]>()
  if (ids.length === 0) return { authors, categories }
  const ph = placeholders(ids.length)
  for (const row of await all<{ book_id: number; name: string }>(
    `SELECT book_id, name FROM book_authors WHERE book_id IN (${ph}) ORDER BY book_id, position`,
    ids,
  )) {
    const list = authors.get(row.book_id) ?? []
    list.push(row.name)
    authors.set(row.book_id, list)
  }
  for (const row of await all<{ book_id: number; slug: string; name: string }>(
    `SELECT bc.book_id, c.slug, c.name FROM book_categories bc
       JOIN categories c ON c.id = bc.category_id
      WHERE bc.book_id IN (${ph}) ORDER BY c.name`,
    ids,
  )) {
    const list = categories.get(row.book_id) ?? []
    list.push({ slug: row.slug, name: row.name })
    categories.set(row.book_id, list)
  }
  return { authors, categories }
}

async function toSummaries(rows: BookRow[]): Promise<BookSummary[]> {
  const { authors, categories } = await loadRelations(rows.map((r) => r.id))
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    subtitle: r.subtitle,
    authors: authors.get(r.id) ?? [],
    categories: categories.get(r.id) ?? [],
    publishedYear: r.published_year,
    coverKey: r.cover_key,
    coverColor: r.cover_color,
    availableCopies: r.available_copies,
    totalCopies: r.total_copies,
    createdAt: r.created_at,
    status: r.status,
  }))
}

async function toDetail(row: BookRow): Promise<BookDetail> {
  const [summary] = await toSummaries([row])
  const waiting =
    (await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM reservations WHERE book_id = ? AND status = 'waiting'`,
      [row.id],
    ))?.n ?? 0
  return {
    ...summary!,
    description: row.description,
    publisher: row.publisher,
    isbn13: row.isbn13,
    isbn10: row.isbn10,
    language: row.language,
    pageCount: row.page_count,
    callNumber: row.call_number,
    keywords: row.keywords,
    sourceProvider: row.source_provider,
    sourceRef: row.source_ref,
    sourceUrl: row.source_url,
    featured: Boolean(row.featured),
    editorialPick: Boolean(row.editorial_pick),
    editorialNote: row.editorial_note,
    editorialQuote: row.editorial_quote,
    waitingReservations: waiting,
    isDemo: Boolean(row.is_demo),
    updatedAt: row.updated_at,
  }
}

/* ───────────────────────── Texto de búsqueda ───────────────────────── */

const LEADING_ARTICLES = /^(el|la|los|las|lo|un|una|unos|unas|the|a|an|le|les|l)\s+/

/** Título para ordenar como en un catálogo: sin tildes y sin artículo inicial. */
export function sortTitle(title: string): string {
  return normalizeText(title)
    .replace(/^[^a-z0-9]+/, '')
    .replace(LEADING_ARTICLES, '')
}

function buildSearchText(input: {
  title: string
  subtitle?: string | null
  authors: string[]
  publisher?: string | null
  isbn13?: string | null
  isbn10?: string | null
  keywords?: string | null
  categoryNames: string[]
}): string {
  return normalizeText(
    [
      input.title,
      input.subtitle,
      input.authors.join(' '),
      input.publisher,
      input.isbn13,
      input.isbn10,
      input.keywords,
      input.categoryNames.join(' '),
    ]
      .filter(Boolean)
      .join(' '),
  )
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (m) => `\\${m}`)
}

/* ───────────────────────── Categorías ───────────────────────── */

export async function listCategories(): Promise<CategoryWithCount[]> {
  return (await all<{ id: number; slug: string; name: string; description: string | null; book_count: number }>(
    `SELECT c.id, c.slug, c.name, c.description,
            (SELECT COUNT(*) FROM book_categories bc JOIN books b ON b.id = bc.book_id
              WHERE bc.category_id = c.id AND b.status = 'active') AS book_count
       FROM categories c ORDER BY c.name`,
  )).map((r) => ({ id: r.id, slug: r.slug, name: r.name, description: r.description, bookCount: r.book_count }))
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  return await get<Category>('SELECT id, slug, name, description FROM categories WHERE slug = ?', [slug]) ?? null
}

/** Devuelve los ids de las categorías, creándolas si no existen. */
async function ensureCategories(names: string[]): Promise<{ id: number; name: string }[]> {
  const result: { id: number; name: string }[] = []
  const seen = new Set<string>()
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, ' ')
    if (!name) continue
    const slug = slugify(name, 60)
    if (seen.has(slug)) continue
    seen.add(slug)
    const existing = await get<{ id: number; name: string }>('SELECT id, name FROM categories WHERE slug = ?', [slug])
    if (existing) {
      result.push(existing)
    } else {
      const label = name.charAt(0).toUpperCase() + name.slice(1)
      const { lastInsertRowid } = await run('INSERT INTO categories (slug, name) VALUES (?, ?)', [slug, label])
      result.push({ id: lastInsertRowid, name: label })
    }
  }
  return result
}

/** Índice de categorías para la portada: recuento y hasta tres portadas por categoría. */
export async function getCategoryIndex(): Promise<
  (CategoryWithCount & { covers: { coverKey: string; coverColor: string | null; title: string }[] })[]
> {
  const categories = (await listCategories()).filter((c) => c.bookCount > 0)
  return Promise.all(categories
    .sort((a, b) => b.bookCount - a.bookCount || a.name.localeCompare(b.name, 'es'))
    .map(async (category) => ({
      ...category,
      covers: (await all<{ cover_key: string; cover_color: string | null; title: string }>(
        `SELECT b.cover_key, b.cover_color, b.title FROM books b
           JOIN book_categories bc ON bc.book_id = b.id
          WHERE bc.category_id = ? AND b.status = 'active' AND b.cover_key IS NOT NULL
          ORDER BY b.created_at DESC LIMIT 3`,
        [category.id],
      )).map((r) => ({ coverKey: r.cover_key, coverColor: r.cover_color, title: r.title })),
    })))
}

/* ───────────────────────── Búsqueda y listados ───────────────────────── */

export type BookSort = 'relevance' | 'title' | 'recent' | 'popular'

export interface BookSearchParams {
  q?: string
  category?: string
  availability?: 'available'
  language?: string
  sort?: BookSort
  page?: number
  pageSize?: number
  status?: BookStatus | 'all'
}

export interface BookSearchResult {
  items: BookSummary[]
  total: number
  page: number
  pageCount: number
  pageSize: number
}

export async function searchBooks(params: BookSearchParams): Promise<BookSearchResult> {
  const pageSize = Math.min(Math.max(params.pageSize ?? 24, 1), 100)
  const where: string[] = []
  const values: Record<string, SqlValue> = {}

  const status = params.status ?? 'active'
  if (status !== 'all') {
    where.push('b.status = :status')
    values.status = status
  }

  const q = params.q?.trim() ?? ''
  let hasTextQuery = false
  // Parámetros solo de la ordenación por relevancia: node:sqlite rechaza parámetros que la consulta no usa.
  const relevanceValues: Record<string, SqlValue> = {}
  if (q) {
    const isbn = looksLikeIsbn(q) ? normalizeIsbn(q) : null
    if (isbn) {
      where.push('(b.isbn13 = :isbn13 OR b.isbn10 = :isbn10)')
      values.isbn13 = isbn.isbn13
      values.isbn10 = isbn.isbn10 ?? '__none__'
    } else {
      const terms = normalizeText(q).split(' ').filter(Boolean).slice(0, 8)
      terms.forEach((term, i) => {
        where.push(`b.search_text LIKE :t${i} ESCAPE '\\'`)
        values[`t${i}`] = `%${escapeLike(term)}%`
      })
      if (terms.length) {
        hasTextQuery = true
        relevanceValues.qPrefix = `${escapeLike(sortTitle(q))}%`
        relevanceValues.qFull = `%${escapeLike(normalizeText(q))}%`
      }
    }
  }

  if (params.category) {
    where.push(`EXISTS (SELECT 1 FROM book_categories bc JOIN categories c ON c.id = bc.category_id
                        WHERE bc.book_id = b.id AND c.slug = :category)`)
    values.category = params.category
  }
  if (params.availability === 'available') where.push(FREE_COPIES_CONDITION)
  if (params.language) {
    where.push('b.language = :language')
    values.language = params.language
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total = (await get<{ n: number }>(`SELECT COUNT(*) AS n FROM books b ${clause}`, values))?.n ?? 0
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const page = Math.min(Math.max(params.page ?? 1, 1), pageCount)

  const sort: BookSort = params.sort ?? (hasTextQuery ? 'relevance' : 'title')
  let orderBy: string
  let orderValues: Record<string, SqlValue> = {}
  switch (sort) {
    case 'relevance':
      if (hasTextQuery) {
        orderBy = `CASE WHEN b.sort_title LIKE :qPrefix ESCAPE '\\' THEN 0
                WHEN b.search_text LIKE :qFull ESCAPE '\\' THEN 1 ELSE 2 END, b.sort_title`
        orderValues = relevanceValues
      } else {
        orderBy = 'b.sort_title'
      }
      break
    case 'recent':
      orderBy = 'b.created_at DESC, b.id DESC'
      break
    case 'popular':
      orderBy = `(SELECT COUNT(*) FROM loans l WHERE l.book_id = b.id AND l.status IN ('checked_out','returned')) DESC, b.sort_title`
      break
    default:
      orderBy = 'b.sort_title'
  }
  const rows = await all<BookRow>(`${BOOK_SELECT} ${clause} ORDER BY ${orderBy} LIMIT :limit OFFSET :offset`, {
    ...values,
    ...orderValues,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  })
  return { items: await toSummaries(rows), total, page, pageCount, pageSize }
}

export async function listLanguages(): Promise<{ code: string; count: number }[]> {
  return await all<{ code: string; count: number }>(
    `SELECT language AS code, COUNT(*) AS count FROM books
      WHERE status = 'active' AND language IS NOT NULL GROUP BY language ORDER BY count DESC`,
  )
}

export async function getBookBySlug(slug: string, options: { includeArchived?: boolean } = {}): Promise<BookDetail | null> {
  const row = await get<BookRow>(`${BOOK_SELECT} WHERE b.slug = ?`, [slug])
  if (!row || (row.status === 'archived' && !options.includeArchived)) return null
  return await toDetail(row)
}

export async function getBookById(id: number): Promise<BookDetail | null> {
  const row = await get<BookRow>(`${BOOK_SELECT} WHERE b.id = ?`, [id])
  return row ? await toDetail(row) : null
}

/** Portadas para el hero: destacados con portada y, si faltan, las últimas incorporaciones con portada. */
export async function getHeroBooks(limit = 3): Promise<BookSummary[]> {
  const rows = await all<BookRow>(
    `${BOOK_SELECT} WHERE b.status = 'active' AND b.cover_key IS NOT NULL
      ORDER BY b.featured DESC, b.created_at DESC LIMIT ?`,
    [limit],
  )
  return await toSummaries(rows)
}

export async function getFeaturedBooks(limit = 4): Promise<BookSummary[]> {
  return await toSummaries(
    await all<BookRow>(
      `${BOOK_SELECT} WHERE b.status = 'active' AND b.featured = TRUE ORDER BY b.updated_at DESC LIMIT ?`,
      [limit],
    ),
  )
}

export async function getLatestBooks(limit = 10): Promise<BookSummary[]> {
  return await toSummaries(
    await all<BookRow>(`${BOOK_SELECT} WHERE b.status = 'active' ORDER BY b.created_at DESC, b.id DESC LIMIT ?`, [limit]),
  )
}

export async function getAvailableBooks(limit = 10, excludeIds: number[] = []): Promise<BookSummary[]> {
  const exclusion = excludeIds.length ? `AND b.id NOT IN (${placeholders(excludeIds.length)})` : ''
  return await toSummaries(
    await all<BookRow>(
      `${BOOK_SELECT} WHERE b.status = 'active' AND ${FREE_COPIES_CONDITION} ${exclusion}
        ORDER BY b.sort_title LIMIT ?`,
      [...excludeIds, limit],
    ),
  )
}

/**
 * Ranking de préstamos de los últimos `days` días. Devuelve null si no hay
 * datos suficientes para que el ranking signifique algo (no se inventa popularidad).
 */
export async function getMostBorrowed(options: { days?: number; minLoans?: number; limit?: number } = {}) {
  const days = options.days ?? 90
  const since = new Date(Date.now() - days * 86_400_000).toISOString()
  const total =
    (await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM loans WHERE status IN ('checked_out','returned') AND checked_out_at >= ?`,
      [since],
    ))?.n ?? 0
  if (total < (options.minLoans ?? 10)) return null
  const ranked = await all<{ book_id: number; loans: number }>(
    `SELECT l.book_id, COUNT(*) AS loans FROM loans l JOIN books b ON b.id = l.book_id
      WHERE l.status IN ('checked_out','returned') AND l.checked_out_at >= ? AND b.status = 'active'
      GROUP BY l.book_id ORDER BY loans DESC LIMIT ?`,
    [since, options.limit ?? 5],
  )
  if (ranked.length < 3) return null
  const rows = await all<BookRow>(
    `${BOOK_SELECT} WHERE b.id IN (${placeholders(ranked.length)})`,
    ranked.map((r) => r.book_id),
  )
  const summaries = new Map((await toSummaries(rows)).map((s) => [s.id, s]))
  return {
    days,
    items: ranked
      .map((r) => ({ book: summaries.get(r.book_id)!, loans: r.loans }))
      .filter((r) => r.book),
  }
}

export async function getEditorialPick(): Promise<BookDetail | null> {
  const row = await get<BookRow>(`${BOOK_SELECT} WHERE b.status = 'active' AND b.editorial_pick = TRUE LIMIT 1`)
  return row ? await toDetail(row) : null
}

export async function getRelatedBooks(book: BookDetail, limit = 8): Promise<BookSummary[]> {
  const authorNames = book.authors
  const categorySlugs = book.categories.map((c) => c.slug)
  if (authorNames.length === 0 && categorySlugs.length === 0) return []
  const rows = await all<BookRow>(
    `${BOOK_SELECT}
      WHERE b.status = 'active' AND b.id <> ?
        AND (
          EXISTS (SELECT 1 FROM book_authors a WHERE a.book_id = b.id AND a.name IN (${placeholders(Math.max(authorNames.length, 1))}))
          OR EXISTS (SELECT 1 FROM book_categories bc JOIN categories c ON c.id = bc.category_id
                      WHERE bc.book_id = b.id AND c.slug IN (${placeholders(Math.max(categorySlugs.length, 1))}))
        )
      ORDER BY EXISTS (SELECT 1 FROM book_authors a WHERE a.book_id = b.id AND a.name IN (${placeholders(Math.max(authorNames.length, 1))})) DESC,
               b.created_at DESC
      LIMIT ?`,
    [
      book.id,
      ...(authorNames.length ? authorNames : ['__none__']),
      ...(categorySlugs.length ? categorySlugs : ['__none__']),
      ...(authorNames.length ? authorNames : ['__none__']),
      limit,
    ],
  )
  return await toSummaries(rows)
}

/** Sugerencias reales para el buscador del hero: un autor, una categoría y un ISBN del catálogo. */
export async function getSearchSuggestions(): Promise<string[]> {
  const author = (await get<{ name: string }>(
    `SELECT a.name FROM book_authors a JOIN books b ON b.id = a.book_id
      WHERE b.status = 'active' GROUP BY a.name ORDER BY COUNT(*) DESC, a.name LIMIT 1`,
  ))?.name
  const category = (await get<{ name: string }>(
    `SELECT c.name FROM categories c JOIN book_categories bc ON bc.category_id = c.id
       JOIN books b ON b.id = bc.book_id WHERE b.status = 'active'
      GROUP BY c.id ORDER BY COUNT(*) DESC LIMIT 1 OFFSET 1`,
  ))?.name
  const isbn = (await get<{ isbn13: string }>(
    `SELECT isbn13 FROM books WHERE status = 'active' AND isbn13 IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
  ))?.isbn13
  return [author, category?.toLowerCase(), isbn].filter((s): s is string => Boolean(s))
}

/* ───────────────────────── Duplicados ───────────────────────── */

export interface DuplicateMatch {
  id: number
  slug: string
  title: string
  authors: string[]
  isbn13: string | null
  publishedYear: number | null
  status: BookStatus
  reason: 'isbn' | 'title'
}

export async function findPossibleDuplicates(input: {
  isbn?: string | null
  title?: string | null
  authors?: string[]
  excludeId?: number
}): Promise<{ exact: DuplicateMatch[]; similar: DuplicateMatch[] }> {
  const exclude = input.excludeId ?? -1
  const exact: DuplicateMatch[] = []
  const similar: DuplicateMatch[] = []
  const isbn = normalizeIsbn(input.isbn)

  const toMatch = async (rows: BookRow[], reason: DuplicateMatch['reason']) =>
    (await toSummaries(rows)).map((s, i) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      authors: s.authors,
      isbn13: rows[i]!.isbn13,
      publishedYear: s.publishedYear,
      status: s.status,
      reason,
    }))

  if (isbn) {
    exact.push(
      ...(await toMatch(
        await all<BookRow>(`${BOOK_SELECT} WHERE (b.isbn13 = ? OR b.isbn10 = ?) AND b.id <> ?`, [
          isbn.isbn13,
          isbn.isbn10 ?? '__none__',
          exclude,
        ]),
        'isbn',
      )),
    )
  }

  const title = input.title?.trim()
  if (title && title.length >= 2) {
    const words = sortTitle(title)
      .split(' ')
      .filter((w) => w.length >= 3)
      .sort((a, b) => b.length - a.length)
    const anchor = words[0] ?? sortTitle(title)
    const candidates = await all<BookRow>(
      `${BOOK_SELECT} WHERE b.sort_title LIKE ? ESCAPE '\\' AND b.id <> ? LIMIT 60`,
      [`%${escapeLike(anchor)}%`, exclude],
    )
    const wantedAuthors = (input.authors ?? []).map((a) => normalizeText(a)).filter(Boolean)
    const exactIds = new Set(exact.map((e) => e.id))
    const scored = (await toMatch(candidates, 'title')).filter((candidate) => {
      if (exactIds.has(candidate.id)) return false
      const titleScore = similarity(sortTitle(candidate.title), sortTitle(title))
      if (titleScore < 0.82) return false
      if (wantedAuthors.length === 0 || candidate.authors.length === 0) return true
      const have = candidate.authors.map((a) => normalizeText(a))
      return wantedAuthors.some((w) => have.some((h) => similarity(h, w) > 0.7 || h.includes(w) || w.includes(h)))
    })
    similar.push(...scored.slice(0, 5))
  }
  return { exact, similar }
}

/* ───────────────────────── Altas y ediciones ───────────────────────── */

export interface BookInput {
  title: string
  subtitle?: string | null
  authors: string[]
  description?: string | null
  publisher?: string | null
  publishedYear?: number | null
  isbn?: string | null
  language?: string | null
  pageCount?: number | null
  callNumber?: string | null
  keywords?: string | null
  categories: string[]
  featured?: boolean
  editorialPick?: boolean
  editorialNote?: string | null
  editorialQuote?: string | null
  sourceProvider?: string
  sourceRef?: string | null
  sourceUrl?: string | null
  isDemo?: boolean
}

async function uniqueSlug(base: string, excludeId?: number): Promise<string> {
  let slug = base
  let n = 2
  while (await get<{ id: number }>('SELECT id FROM books WHERE slug = ? AND id <> ?', [slug, excludeId ?? -1])) {
    slug = `${base}-${n++}`
  }
  return slug
}

/** Signatura sencilla de estantería: clase (inicial de la categoría), 3 letras del autor y 3 del título. */
export function suggestCallNumber(input: { title: string; authors: string[]; categories: string[] }): string {
  const cls = (input.categories[0] ?? 'General').trim().charAt(0).toUpperCase()
  const surname = (input.authors[0] ?? '').trim().split(/\s+/).pop() ?? ''
  const author = normalizeText(surname).replace(/[^a-z]/g, '').slice(0, 3).toUpperCase() || 'ANO'
  const title = sortTitle(input.title).replace(/[^a-z]/g, '').slice(0, 3) || 'tit'
  return `${cls} ${author} ${title}`
}

async function assertIsbnFree(isbn: ReturnType<typeof normalizeIsbn>, excludeId?: number) {
  if (!isbn) return
  const clash = await get<{ id: number; title: string }>(
    'SELECT id, title FROM books WHERE (isbn13 = ? OR isbn10 = ?) AND id <> ?',
    [isbn.isbn13, isbn.isbn10 ?? '__none__', excludeId ?? -1],
  )
  if (clash) {
    throw new DomainError(
      `El ISBN ya pertenece a «${clash.title}». Añade ejemplares a esa ficha en lugar de duplicarla.`,
      'duplicate_isbn',
      { isbn: 'Este ISBN ya está en el catálogo.' },
    )
  }
}

async function writeRelations(bookId: number, authors: string[], categories: { id: number }[]) {
  await run('DELETE FROM book_authors WHERE book_id = ?', [bookId])
  for (const [position, name] of authors.entries()) {
    await run('INSERT INTO book_authors (book_id, position, name) VALUES (?, ?, ?)', [bookId, position, name])
  }
  await run('DELETE FROM book_categories WHERE book_id = ?', [bookId])
  for (const c of categories) {
    await run('INSERT INTO book_categories (book_id, category_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [bookId, c.id])
  }
}

function cleanAuthors(authors: string[]): string[] {
  const seen = new Set<string>()
  return authors
    .map((a) => a.trim().replace(/\s+/g, ' '))
    .filter((a) => {
      const key = normalizeText(a)
      if (!a || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export async function createBook(input: BookInput, actorId: number | null): Promise<{ id: number; slug: string }> {
  return await transaction(async () => {
    const isbn = normalizeIsbn(input.isbn)
    if (input.isbn && !isbn) {
      throw new DomainError('El ISBN no es válido. Revisa los dígitos.', 'invalid_isbn', {
        isbn: 'ISBN no válido (10 o 13 dígitos con dígito de control correcto).',
      })
    }
    await assertIsbnFree(isbn)
    const authors = cleanAuthors(input.authors)
    const categories = await ensureCategories(input.categories)
    const slug = await uniqueSlug(slugify(`${input.title} ${authors[0]?.split(' ').pop() ?? ''}`))
    if (input.editorialPick) await run('UPDATE books SET editorial_pick = FALSE WHERE editorial_pick = TRUE')
    const callNumber =
      input.callNumber?.trim() ||
      suggestCallNumber({ title: input.title, authors, categories: categories.map((c) => c.name) })
    const { lastInsertRowid: id } = await run(
      `INSERT INTO books (slug, title, subtitle, description, publisher, published_year, isbn13, isbn10,
         language, page_count, call_number, keywords, source_provider, source_ref, source_url,
         featured, editorial_pick, editorial_note, editorial_quote, is_demo, search_text, sort_title, created_by)
       VALUES (:slug, :title, :subtitle, :description, :publisher, :year, :isbn13, :isbn10,
         :language, :pages, :callNumber, :keywords, :provider, :ref, :url,
         :featured, :pick, :note, :quote, :demo, :search, :sort, :actor)`,
      {
        slug,
        title: input.title.trim(),
        subtitle: input.subtitle?.trim() || null,
        description: input.description?.trim() || null,
        publisher: input.publisher?.trim() || null,
        year: input.publishedYear ?? null,
        isbn13: isbn?.isbn13 ?? null,
        isbn10: isbn?.isbn10 ?? null,
        language: input.language || null,
        pages: input.pageCount ?? null,
        callNumber,
        keywords: input.keywords?.trim() || null,
        provider: input.sourceProvider ?? 'manual',
        ref: input.sourceRef ?? null,
        url: input.sourceUrl ?? null,
        featured: Boolean(input.featured),
        pick: Boolean(input.editorialPick),
        note: input.editorialNote?.trim() || null,
        quote: input.editorialQuote?.trim() || null,
        demo: Boolean(input.isDemo),
        search: buildSearchText({
          title: input.title,
          subtitle: input.subtitle,
          authors,
          publisher: input.publisher,
          isbn13: isbn?.isbn13,
          isbn10: isbn?.isbn10,
          keywords: input.keywords,
          categoryNames: categories.map((c) => c.name),
        }),
        sort: sortTitle(input.title),
        actor: actorId,
      },
    )
    await writeRelations(id, authors, categories)
    await logAudit({
      actorId,
      action: input.sourceProvider && input.sourceProvider !== 'manual' ? 'book.imported' : 'book.created',
      entityType: 'book',
      entityId: id,
      summary:
        input.sourceProvider && input.sourceProvider !== 'manual'
          ? `Importó «${input.title}» desde ${input.sourceProvider}`
          : `Creó la ficha de «${input.title}»`,
    })
    return { id, slug }
  })
}

export async function updateBook(id: number, input: BookInput, actorId: number): Promise<{ id: number; slug: string }> {
  return await transaction(async () => {
    const current = await get<{ id: number; slug: string; title: string }>('SELECT id, slug, title FROM books WHERE id = ?', [id])
    if (!current) throw new DomainError('La ficha que intentas editar ya no existe.', 'not_found')
    const isbn = normalizeIsbn(input.isbn)
    if (input.isbn && !isbn) {
      throw new DomainError('El ISBN no es válido. Revisa los dígitos.', 'invalid_isbn', {
        isbn: 'ISBN no válido (10 o 13 dígitos con dígito de control correcto).',
      })
    }
    await assertIsbnFree(isbn, id)
    const authors = cleanAuthors(input.authors)
    const categories = await ensureCategories(input.categories)
    if (input.editorialPick) {
      await run('UPDATE books SET editorial_pick = FALSE WHERE editorial_pick = TRUE AND id <> ?', [id])
    }
    await run(
      `UPDATE books SET title = :title, subtitle = :subtitle, description = :description, publisher = :publisher,
         published_year = :year, isbn13 = :isbn13, isbn10 = :isbn10, language = :language, page_count = :pages,
         call_number = :callNumber, keywords = :keywords, featured = :featured, editorial_pick = :pick,
         editorial_note = :note, editorial_quote = :quote, search_text = :search, sort_title = :sort,
         updated_at = :now
       WHERE id = :id`,
      {
        id,
        title: input.title.trim(),
        subtitle: input.subtitle?.trim() || null,
        description: input.description?.trim() || null,
        publisher: input.publisher?.trim() || null,
        year: input.publishedYear ?? null,
        isbn13: isbn?.isbn13 ?? null,
        isbn10: isbn?.isbn10 ?? null,
        language: input.language || null,
        pages: input.pageCount ?? null,
        callNumber:
          input.callNumber?.trim() ||
          suggestCallNumber({ title: input.title, authors, categories: categories.map((c) => c.name) }),
        keywords: input.keywords?.trim() || null,
        featured: Boolean(input.featured),
        pick: Boolean(input.editorialPick),
        note: input.editorialNote?.trim() || null,
        quote: input.editorialQuote?.trim() || null,
        search: buildSearchText({
          title: input.title,
          subtitle: input.subtitle,
          authors,
          publisher: input.publisher,
          isbn13: isbn?.isbn13,
          isbn10: isbn?.isbn10,
          keywords: input.keywords,
          categoryNames: categories.map((c) => c.name),
        }),
        sort: sortTitle(input.title),
        now: now(),
      },
    )
    await writeRelations(id, authors, categories)
    await logAudit({
      actorId,
      action: 'book.updated',
      entityType: 'book',
      entityId: id,
      summary: `Editó la ficha de «${input.title}»`,
    })
    return { id, slug: current.slug }
  })
}

export async function setBookCover(bookId: number, coverKey: string | null, coverColor: string | null, actorId: number) {
  const book = await get<{ title: string; cover_key: string | null }>('SELECT title, cover_key FROM books WHERE id = ?', [bookId])
  if (!book) throw new DomainError('La ficha ya no existe.', 'not_found')
  await run('UPDATE books SET cover_key = ?, cover_color = ?, updated_at = ? WHERE id = ?', [
    coverKey,
    coverColor,
    now(),
    bookId,
  ])
  await logAudit({
    actorId,
    action: coverKey ? 'book.cover_updated' : 'book.cover_removed',
    entityType: 'book',
    entityId: bookId,
    summary: coverKey ? `Cambió la portada de «${book.title}»` : `Quitó la portada de «${book.title}»`,
  })
  return { previousKey: book.cover_key }
}

export async function setBookStatus(bookId: number, status: BookStatus, actorId: number) {
  const book = await get<{ title: string }>('SELECT title FROM books WHERE id = ?', [bookId])
  if (!book) throw new DomainError('La ficha ya no existe.', 'not_found')
  if (status === 'archived') {
    const active = (await get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM loans WHERE book_id = ? AND status IN ('pending','approved','checked_out')`,
      [bookId],
    ))?.n ?? 0
    if (active > 0) {
      throw new DomainError(
        `No se puede archivar: hay ${active} préstamo(s) o solicitud(es) en curso. Ciérralos primero.`,
        'has_active_loans',
      )
    }
  }
  await transaction(async () => {
    await run('UPDATE books SET status = ?, updated_at = ? WHERE id = ?', [status, now(), bookId])
    if (status === 'archived') {
      await run(`UPDATE reservations SET status = 'cancelled', updated_at = ? WHERE book_id = ? AND status = 'waiting'`, [
        now(),
        bookId,
      ])
    }
    logAudit({
      actorId,
      action: status === 'archived' ? 'book.archived' : 'book.restored',
      entityType: 'book',
      entityId: bookId,
      summary: status === 'archived' ? `Archivó «${book.title}»` : `Recuperó «${book.title}» del archivo`,
    })
  })
}

/** Borra una ficha solo si nunca tuvo préstamos; si los tuvo, hay que archivarla para conservar el historial. */
export async function deleteBook(bookId: number, actorId: number): Promise<{ coverKey: string | null }> {
  return await transaction(async () => {
    const book = await get<{ title: string; cover_key: string | null }>('SELECT title, cover_key FROM books WHERE id = ?', [bookId])
    if (!book) throw new DomainError('La ficha ya no existe.', 'not_found')
    const loans = (await get<{ n: number }>('SELECT COUNT(*) AS n FROM loans WHERE book_id = ?', [bookId]))?.n ?? 0
    if (loans > 0) {
      throw new DomainError(
        'Este libro tiene historial de préstamos. Archívalo en lugar de eliminarlo para conservar el registro.',
        'has_history',
      )
    }
    await run('DELETE FROM books WHERE id = ?', [bookId])
    logAudit({
      actorId,
      action: 'book.deleted',
      entityType: 'book',
      entityId: bookId,
      summary: `Eliminó la ficha de «${book.title}»`,
    })
    return { coverKey: book.cover_key }
  })
}

/* ───────────────────────── Ejemplares ───────────────────────── */

interface CopyRow {
  id: number
  book_id: number
  code: string
  location: string | null
  condition: CopyCondition
  status: CopyStatus
  notes: string | null
  acquired_at: string | null
  created_at: string
}

function toCopy(r: CopyRow): Copy {
  return {
    id: r.id,
    bookId: r.book_id,
    code: r.code,
    location: r.location,
    condition: r.condition,
    status: r.status,
    notes: r.notes,
    acquiredAt: r.acquired_at,
    createdAt: r.created_at,
  }
}

export async function listCopies(bookId: number): Promise<Copy[]> {
  return (await all<CopyRow>('SELECT * FROM copies WHERE book_id = ? ORDER BY code', [bookId])).map(toCopy)
}

export async function getCopy(copyId: number): Promise<Copy | null> {
  const row = await get<CopyRow>('SELECT * FROM copies WHERE id = ?', [copyId])
  return row ? toCopy(row) : null
}

/** Inserta ejemplares con código correlativo GG-000001. Devuelve sus ids. */
export async function insertCopies(
  bookId: number,
  count: number,
  options: { location?: string | null; condition?: CopyCondition; acquiredAt?: string | null },
): Promise<number[]> {
  const ids: number[] = []
  for (let i = 0; i < count; i++) {
    const next = ((await get<{ n: number }>('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM copies'))?.n ?? 1) as number
    const code = `GG-${String(next).padStart(6, '0')}`
    const { lastInsertRowid } = await run(
      `INSERT INTO copies (book_id, code, location, condition, status, acquired_at)
       VALUES (?, ?, ?, ?, 'available', ?)`,
      [bookId, code, options.location?.trim() || null, options.condition ?? 'good', options.acquiredAt ?? now()],
    )
    ids.push(lastInsertRowid)
  }
  return ids
}

export async function updateCopyDetails(
  copyId: number,
  input: { location?: string | null; condition: CopyCondition; notes?: string | null },
  actorId: number,
) {
  const copy = await getCopy(copyId)
  if (!copy) throw new DomainError('El ejemplar ya no existe.', 'not_found')
  await run('UPDATE copies SET location = ?, condition = ?, notes = ?, updated_at = ? WHERE id = ?', [
    input.location?.trim() || null,
    input.condition,
    input.notes?.trim() || null,
    now(),
    copyId,
  ])
  await logAudit({
    actorId,
    action: 'copy.updated',
    entityType: 'copy',
    entityId: copyId,
    summary: `Actualizó el ejemplar ${copy.code}`,
  })
}
