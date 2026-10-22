import { normalizeText } from '@/lib/text'
import { searchBooks, searchFacets, type BookSearchParams, type BookSearchResult, type SearchFacets } from './catalog'

/**
 * Caché de consultas del buscador. La búsqueda en tiempo real lanza una consulta cada
 * vez que el lector deja de teclear, así que la misma consulta llega muchas veces
 * («cien», «cien a», «cien años»…, y la de otros lectores). Esta caché:
 *
 *  - guarda hasta 1.000 consultas distintas (LRU: se descarta la menos usada);
 *  - las mantiene 15 segundos, de modo que la disponibilidad nunca va muy por detrás;
 *  - comparte una única consulta a la base de datos entre peticiones simultáneas idénticas;
 *  - se vacía en cuanto el catálogo o la circulación cambian (`invalidateSearchCache`).
 *
 * Vive en la memoria de cada instancia; con varias instancias, cada una tiene la suya.
 */
export const SEARCH_CACHE_CAPACITY = 1_000
const TTL_MS = 15_000

interface Entry<T> {
  value: Promise<T>
  expires: number
}

export class QueryCache<T> {
  private entries = new Map<string, Entry<T>>()
  private generation = 0

  constructor(
    private readonly capacity: number,
    private readonly ttlMs: number,
  ) {}

  get size() {
    return this.entries.size
  }

  async get(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now()
    const hit = this.entries.get(key)
    if (hit && hit.expires > now) {
      // Map conserva el orden de inserción: reinsertar = marcar como usada recientemente.
      this.entries.delete(key)
      this.entries.set(key, hit)
      return hit.value
    }
    const generation = this.generation
    const value = load()
    this.entries.delete(key)
    this.entries.set(key, { value, expires: now + this.ttlMs })
    while (this.entries.size > this.capacity) {
      this.entries.delete(this.entries.keys().next().value!)
    }
    // Un error no se guarda: la siguiente petición lo vuelve a intentar.
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key)
    })
    try {
      return await value
    } finally {
      // Si se invalidó mientras se consultaba, el resultado puede ser viejo: no se conserva.
      if (generation !== this.generation && this.entries.get(key)?.value === value) this.entries.delete(key)
    }
  }

  clear() {
    this.generation++
    this.entries.clear()
  }
}

export interface CatalogSearch {
  result: BookSearchResult
  facets: SearchFacets
}

const globalForCache = globalThis as typeof globalThis & { __gotaGotaSearchCache?: QueryCache<CatalogSearch> }
const cache = (globalForCache.__gotaGotaSearchCache ??= new QueryCache<CatalogSearch>(SEARCH_CACHE_CAPACITY, TTL_MS))

/** Clave estable: dos consultas que solo difieren en mayúsculas, tildes o espacios comparten entrada. */
export function searchKey(params: BookSearchParams): string {
  return JSON.stringify([
    normalizeText(params.q ?? ''),
    params.category ?? '',
    params.availability ?? '',
    params.language ?? '',
    params.sort ?? '',
    params.page ?? 1,
    params.pageSize ?? 24,
    params.status ?? 'active',
  ])
}

/** Resultados y contadores de filtros de una búsqueda del catálogo público. */
export function cachedCatalogSearch(params: BookSearchParams): Promise<CatalogSearch> {
  return cache.get(searchKey(params), async () => {
    const [result, facets] = await Promise.all([searchBooks(params), searchFacets(params)])
    return { result, facets }
  })
}

export function invalidateSearchCache() {
  cache.clear()
}

export function searchCacheSize() {
  return cache.size
}
