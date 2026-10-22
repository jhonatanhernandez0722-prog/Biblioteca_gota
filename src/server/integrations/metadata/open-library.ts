import { looksLikeIsbn, normalizeIsbn } from '@/lib/isbn'
import { fetchJson, parseYear, plainText, toLanguageCode, TtlCache } from './http'
import type {
  BookMetadataProvider,
  MetadataDetails,
  MetadataResult,
  MetadataSearchPage,
  MetadataSearchQuery,
  ProviderInfo,
} from './types'

/**
 * Open Library (Internet Archive). Sin clave. Datos bibliográficos en dominio público (CC0),
 * por lo que se pueden importar y guardar. Límites: 1 petición/s sin identificar, 3/s con
 * User-Agent y correo de contacto. Portadas por ID sin límite estricto.
 * Docs: https://openlibrary.org/developers/api
 */
const BASE = 'https://openlibrary.org'
const PAGE_SIZE = 20
const SEARCH_FIELDS = [
  'key', 'title', 'subtitle', 'author_name', 'first_publish_year', 'cover_i', 'edition_count', 'language',
  'editions', 'editions.key', 'editions.title', 'editions.subtitle', 'editions.isbn', 'editions.publisher',
  'editions.publish_date', 'editions.language', 'editions.cover_i',
].join(',')

interface SearchDoc {
  key: string
  title: string
  subtitle?: string
  author_name?: string[]
  first_publish_year?: number
  cover_i?: number
  edition_count?: number
  language?: string[]
  editions?: {
    docs?: {
      key: string
      title?: string
      subtitle?: string
      isbn?: string[]
      publisher?: string[]
      publish_date?: string[]
      language?: string[]
      cover_i?: number
    }[]
  }
}

interface EditionJson {
  title?: string
  subtitle?: string
  publishers?: string[]
  publish_date?: string
  number_of_pages?: number
  pagination?: string
  isbn_13?: string[]
  isbn_10?: string[]
  covers?: number[]
  works?: { key: string }[]
  authors?: { key: string }[]
  languages?: { key: string }[]
  description?: string | { value: string }
}

interface WorkJson {
  title?: string
  subtitle?: string
  description?: string | { value: string }
  subjects?: string[]
  covers?: number[]
  authors?: { author?: { key: string } }[]
}

function coverUrls(id: number | undefined | null) {
  if (!id || id <= 0) return { coverUrl: null, coverThumbUrl: null }
  return {
    coverUrl: `https://covers.openlibrary.org/b/id/${id}-L.jpg`,
    coverThumbUrl: `https://covers.openlibrary.org/b/id/${id}-M.jpg`,
  }
}

function pickIsbn(list: string[] | undefined) {
  if (!list?.length) return { isbn13: null, isbn10: null }
  const thirteen = list.find((i) => normalizeIsbn(i) && i.replace(/\D/g, '').length === 13)
  const any = thirteen ?? list.find((i) => normalizeIsbn(i))
  const normalized = normalizeIsbn(any)
  return { isbn13: normalized?.isbn13 ?? null, isbn10: normalized?.isbn10 ?? null }
}

function textOf(value: string | { value: string } | undefined): string | null {
  if (!value) return null
  return typeof value === 'string' ? value : value.value
}

export class OpenLibraryProvider implements BookMetadataProvider {
  private readonly searchCache = new TtlCache<MetadataSearchPage>(10 * 60_000)
  private readonly detailCache = new TtlCache<MetadataDetails | null>(60 * 60_000)
  private readonly authorCache = new TtlCache<string | null>(24 * 60 * 60_000, 1000)

  constructor(private readonly contactEmail?: string) {}

  get info(): ProviderInfo {
    return {
      id: 'openlibrary',
      label: 'Open Library',
      configured: true,
      attribution: { name: 'Open Library', url: 'https://openlibrary.org', license: 'Datos CC0 · Internet Archive' },
      notice: this.contactEmail
        ? null
        : 'Sin OPENLIBRARY_CONTACT_EMAIL las consultas se limitan a 1 por segundo. Configúralo para llegar a 3 por segundo.',
    }
  }

  private request<T>(url: string) {
    return fetchJson<T>(url, {
      headers: {
        'User-Agent': this.contactEmail ? `BibliotecaGotaGota/0.1 (${this.contactEmail})` : 'BibliotecaGotaGota/0.1',
      },
      minIntervalMs: this.contactEmail ? 350 : 1000,
      timeoutMs: 9000,
    })
  }

  async search(query: MetadataSearchQuery): Promise<MetadataSearchPage> {
    const q = query.q.trim()
    const params = new URLSearchParams({ fields: SEARCH_FIELDS, limit: String(PAGE_SIZE), page: String(query.page), lang: 'es' })
    const mode = query.mode === 'auto' ? (looksLikeIsbn(q) ? 'isbn' : 'auto') : query.mode
    if (mode === 'isbn') {
      const isbn = normalizeIsbn(q)
      params.set('q', `isbn:${isbn?.isbn13 ?? q.replace(/[\s-]/g, '')}`)
    } else if (mode === 'title') {
      params.set('title', q)
    } else if (mode === 'author') {
      params.set('author', q)
    } else {
      params.set('q', q)
    }
    const cacheKey = params.toString()
    const cached = this.searchCache.get(cacheKey)
    if (cached) return cached

    const data = await this.request<{ numFound: number; docs: SearchDoc[] }>(`${BASE}/search.json?${params}`)
    const docs = data?.docs ?? []
    const items: MetadataResult[] = docs.map((doc) => {
      const edition = doc.editions?.docs?.[0]
      const { isbn13, isbn10 } = pickIsbn(edition?.isbn)
      return {
        provider: 'openlibrary',
        providerId: (edition?.key ?? doc.key).split('/').pop()!,
        title: edition?.title ?? doc.title,
        subtitle: edition?.subtitle ?? doc.subtitle ?? null,
        authors: doc.author_name ?? [],
        year: parseYear(edition?.publish_date?.[0]) ?? doc.first_publish_year ?? null,
        publisher: edition?.publisher?.[0] ?? null,
        isbn13,
        isbn10,
        language: toLanguageCode(edition?.language?.[0] ?? (doc.language?.includes('spa') ? 'spa' : doc.language?.[0])),
        editionCount: doc.edition_count ?? null,
        ...coverUrls(edition?.cover_i ?? doc.cover_i),
      }
    })
    const total = data?.numFound ?? 0
    const page = { items, total, page: query.page, hasMore: query.page * PAGE_SIZE < total }
    this.searchCache.set(cacheKey, page)
    return page
  }

  private async authorName(key: string): Promise<string | null> {
    const cached = this.authorCache.get(key)
    if (cached !== undefined) return cached
    const author = await this.request<{ name?: string; personal_name?: string }>(`${BASE}${key}.json`)
    const name = author?.name ?? author?.personal_name ?? null
    this.authorCache.set(key, name)
    return name
  }

  async getDetails(providerId: string): Promise<MetadataDetails | null> {
    if (!/^OL\d+[MW]$/.test(providerId)) return null
    const cached = this.detailCache.get(providerId)
    if (cached !== undefined) return cached

    const isEdition = providerId.endsWith('M')
    const edition = isEdition ? await this.request<EditionJson>(`${BASE}/books/${providerId}.json`) : null
    if (isEdition && !edition) return null
    const workKey = isEdition ? edition?.works?.[0]?.key : `/works/${providerId}`
    const work = workKey ? await this.request<WorkJson>(`${BASE}${workKey}.json`) : null
    if (!edition && !work) return null

    const authorKeys = (edition?.authors?.map((a) => a.key) ?? work?.authors?.map((a) => a.author?.key) ?? [])
      .filter((k): k is string => Boolean(k))
      .slice(0, 4)
    const authors: string[] = []
    for (const key of authorKeys) {
      const name = await this.authorName(key)
      if (name) authors.push(name)
    }

    const rawDescription = textOf(work?.description) ?? textOf(edition?.description)
    const description = plainText(rawDescription)
    const sourceMatch = description?.match(/(?:Fuente|Source|Origen)\s*:\s*(\S+)/i)
    const isbn = normalizeIsbn(edition?.isbn_13?.[0] ?? edition?.isbn_10?.[0])
    const pageCount =
      edition?.number_of_pages ?? (edition?.pagination ? Number(edition.pagination.match(/(\d{2,4})\s*p/)?.[1]) || null : null)
    const coverId = edition?.covers?.find((c) => c > 0) ?? work?.covers?.find((c) => c > 0)

    const details: MetadataDetails = {
      provider: 'openlibrary',
      providerId,
      title: edition?.title ?? work?.title ?? 'Sin título',
      subtitle: edition?.subtitle ?? work?.subtitle ?? null,
      authors,
      year: parseYear(edition?.publish_date),
      publisher: edition?.publishers?.[0] ?? null,
      isbn13: isbn?.isbn13 ?? null,
      isbn10: isbn?.isbn10 ?? null,
      language: toLanguageCode(edition?.languages?.[0]?.key),
      editionCount: null,
      ...coverUrls(coverId),
      description,
      descriptionSource: sourceMatch?.[1] ?? null,
      pageCount: pageCount ?? null,
      publishedDate: edition?.publish_date ?? null,
      subjects: (work?.subjects ?? []).slice(0, 12),
      sourceUrl: `${BASE}${isEdition ? `/books/${providerId}` : workKey}`,
    }
    this.detailCache.set(providerId, details)
    return details
  }
}
