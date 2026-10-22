import { looksLikeIsbn, normalizeIsbn } from '@/lib/isbn'
import { fetchJson, parseYear, plainText, TtlCache } from './http'
import {
  ProviderError,
  type BookMetadataProvider,
  type MetadataDetails,
  type MetadataResult,
  type MetadataSearchPage,
  type MetadataSearchQuery,
  type ProviderInfo,
} from './types'

/**
 * Google Books API v1. Requiere clave (GOOGLE_BOOKS_API_KEY), con una cuota por defecto
 * de unas 1.000 consultas al día. Atención: los términos de las API de Google (§5e)
 * prohíben crear bases de datos o copias permanentes del contenido devuelto, así que
 * este adaptador está pensado para CONSULTAR; verifica los datos antes de guardarlos.
 * Docs: https://developers.google.com/books/docs/v1/using
 */
const BASE = 'https://www.googleapis.com/books/v1'
const PAGE_SIZE = 20

interface VolumeInfo {
  title?: string
  subtitle?: string
  authors?: string[]
  publisher?: string
  publishedDate?: string
  description?: string
  industryIdentifiers?: { type: string; identifier: string }[]
  pageCount?: number
  categories?: string[]
  imageLinks?: { smallThumbnail?: string; thumbnail?: string }
  language?: string
  infoLink?: string
}

interface Volume {
  id: string
  volumeInfo?: VolumeInfo
}

function classify(status: number, body: string): ProviderError | null {
  if (status === 403 && /quota|rateLimit|dailyLimit/i.test(body)) {
    return new ProviderError('rate_limited', 'Cuota de Google Books agotada', 3600)
  }
  if (status === 400 && /API key not valid|keyInvalid/i.test(body)) {
    return new ProviderError('not_configured', 'La clave de Google Books no es válida')
  }
  return null
}

function coverFrom(info: VolumeInfo | undefined) {
  const thumb = info?.imageLinks?.thumbnail ?? info?.imageLinks?.smallThumbnail
  if (!thumb) return { coverUrl: null, coverThumbUrl: null }
  const secure = thumb.replace(/^http:\/\//, 'https://').replace('&edge=curl', '')
  return { coverUrl: `${secure}&fife=w600-h900`, coverThumbUrl: secure }
}

function toResult(volume: Volume): MetadataResult {
  const info = volume.volumeInfo ?? {}
  const ids = info.industryIdentifiers ?? []
  const isbn = normalizeIsbn(ids.find((i) => i.type === 'ISBN_13')?.identifier ?? ids.find((i) => i.type === 'ISBN_10')?.identifier)
  return {
    provider: 'googlebooks',
    providerId: volume.id,
    title: info.title ?? 'Sin título',
    subtitle: info.subtitle ?? null,
    authors: info.authors ?? [],
    year: parseYear(info.publishedDate),
    publisher: info.publisher ?? null,
    isbn13: isbn?.isbn13 ?? null,
    isbn10: isbn?.isbn10 ?? null,
    language: info.language ?? null,
    editionCount: null,
    ...coverFrom(info),
  }
}

export class GoogleBooksProvider implements BookMetadataProvider {
  private readonly searchCache = new TtlCache<MetadataSearchPage>(10 * 60_000)
  private readonly detailCache = new TtlCache<MetadataDetails | null>(60 * 60_000)

  constructor(private readonly apiKey?: string) {}

  get info(): ProviderInfo {
    return {
      id: 'googlebooks',
      label: 'Google Books',
      configured: Boolean(this.apiKey),
      attribution: { name: 'Google Books', url: 'https://books.google.com', license: 'Términos de las API de Google' },
      notice:
        'Los términos de Google (§5e) no permiten crear bases de datos permanentes con su contenido. Úsalo para consultar y verifica cada dato antes de guardar.',
    }
  }

  private ensureKey(): string {
    if (!this.apiKey) throw new ProviderError('not_configured', 'Falta GOOGLE_BOOKS_API_KEY')
    return this.apiKey
  }

  async search(query: MetadataSearchQuery): Promise<MetadataSearchPage> {
    const key = this.ensureKey()
    const q = query.q.trim()
    const mode = query.mode === 'auto' ? (looksLikeIsbn(q) ? 'isbn' : 'auto') : query.mode
    const expression =
      mode === 'isbn'
        ? `isbn:${normalizeIsbn(q)?.isbn13 ?? q.replace(/[\s-]/g, '')}`
        : mode === 'title'
          ? `intitle:${q}`
          : mode === 'author'
            ? `inauthor:${q}`
            : q
    const params = new URLSearchParams({
      q: expression,
      maxResults: String(PAGE_SIZE),
      startIndex: String((query.page - 1) * PAGE_SIZE),
      printType: 'books',
      fields: 'totalItems,items(id,volumeInfo(title,subtitle,authors,publisher,publishedDate,industryIdentifiers,imageLinks,language))',
      key,
    })
    const cacheKey = `${expression}|${query.page}`
    const cached = this.searchCache.get(cacheKey)
    if (cached) return cached
    const data = await fetchJson<{ totalItems?: number; items?: Volume[] }>(`${BASE}/volumes?${params}`, {
      classify,
      timeoutMs: 8000,
    })
    const items = (data?.items ?? []).map(toResult)
    const total = data?.totalItems ?? 0
    const page = { items, total, page: query.page, hasMore: query.page * PAGE_SIZE < total }
    this.searchCache.set(cacheKey, page)
    return page
  }

  async getDetails(providerId: string): Promise<MetadataDetails | null> {
    const key = this.ensureKey()
    if (!/^[\w-]{6,20}$/.test(providerId)) return null
    const cached = this.detailCache.get(providerId)
    if (cached !== undefined) return cached
    const volume = await fetchJson<Volume>(`${BASE}/volumes/${providerId}?key=${encodeURIComponent(key)}`, {
      classify,
      timeoutMs: 8000,
    })
    if (!volume) {
      this.detailCache.set(providerId, null)
      return null
    }
    const info = volume.volumeInfo ?? {}
    const details: MetadataDetails = {
      ...toResult(volume),
      description: plainText(info.description),
      descriptionSource: null,
      pageCount: info.pageCount ?? null,
      publishedDate: info.publishedDate ?? null,
      subjects: (info.categories ?? []).flatMap((c) => c.split('/').map((s) => s.trim())).filter(Boolean).slice(0, 12),
      sourceUrl: info.infoLink ?? `https://books.google.com/books?id=${providerId}`,
    }
    this.detailCache.set(providerId, details)
    return details
  }
}
