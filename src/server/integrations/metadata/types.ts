/**
 * Contrato común de los proveedores de metadatos bibliográficos.
 * Un proveedor solo CONSULTA: no aloja libros, no gestiona ejemplares ni préstamos.
 * Lo importado se guarda en la base de datos propia de la biblioteca.
 */
export type ProviderId = 'openlibrary' | 'googlebooks'
export type SearchMode = 'auto' | 'isbn' | 'title' | 'author'

export interface MetadataSearchQuery {
  q: string
  mode: SearchMode
  page: number
}

export interface MetadataResult {
  provider: ProviderId
  /** Identificador del proveedor (edición de Open Library «OL…M», volumen de Google Books…). */
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
}

export interface MetadataDetails extends MetadataResult {
  description: string | null
  /** Indica de dónde viene la descripción cuando el proveedor lo declara (p. ej. Wikipedia, CC BY-SA). */
  descriptionSource: string | null
  pageCount: number | null
  publishedDate: string | null
  subjects: string[]
  sourceUrl: string
}

export interface MetadataSearchPage {
  items: MetadataResult[]
  total: number
  page: number
  hasMore: boolean
}

export interface ProviderInfo {
  id: ProviderId
  label: string
  configured: boolean
  attribution: { name: string; url: string; license: string }
  /** Advertencia de uso visible para el personal (términos del servicio, límites). */
  notice: string | null
}

export interface BookMetadataProvider {
  readonly info: ProviderInfo
  search(query: MetadataSearchQuery): Promise<MetadataSearchPage>
  getDetails(providerId: string): Promise<MetadataDetails | null>
}

export type ProviderErrorCode = 'rate_limited' | 'timeout' | 'unavailable' | 'bad_response' | 'not_configured'

export class ProviderError extends Error {
  readonly code: ProviderErrorCode
  readonly retryAfterSeconds?: number

  constructor(code: ProviderErrorCode, message: string, retryAfterSeconds?: number) {
    super(message)
    this.name = 'ProviderError'
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export const PROVIDER_ERROR_MESSAGE: Record<ProviderErrorCode, string> = {
  rate_limited: 'El proveedor está limitando las consultas. Espera un momento y vuelve a intentarlo.',
  timeout: 'El proveedor tardó demasiado en responder. Vuelve a intentarlo en unos segundos.',
  unavailable: 'No se pudo contactar con el proveedor. Comprueba la conexión o inténtalo más tarde.',
  bad_response: 'El proveedor respondió con datos que no se pudieron leer. Prueba con otra búsqueda.',
  not_configured: 'Este proveedor no está configurado en el servidor.',
}
