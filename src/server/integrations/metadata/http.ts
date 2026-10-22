import { ProviderError } from './types'

/** Regulador por host: garantiza un intervalo mínimo entre peticiones al mismo servicio. */
const nextSlot = new Map<string, number>()

async function throttle(host: string, minIntervalMs: number) {
  if (minIntervalMs <= 0) return
  const now = Date.now()
  const slot = Math.max(now, nextSlot.get(host) ?? 0)
  nextSlot.set(host, slot + minIntervalMs)
  const wait = slot - now
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
}

export interface FetchJsonOptions {
  timeoutMs?: number
  headers?: Record<string, string>
  minIntervalMs?: number
  /** Traduce respuestas no OK específicas del proveedor (p. ej. 403 por cuota). */
  classify?: (status: number, body: string) => ProviderError | null
}

/** GET JSON con tiempo máximo, regulación y errores tipados. Devuelve null si 404. */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T | null> {
  const host = new URL(url).host
  await throttle(host, options.minIntervalMs ?? 0)
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json', ...options.headers },
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
      cache: 'no-store',
    })
  } catch (error) {
    const name = (error as Error).name
    if (name === 'TimeoutError' || name === 'AbortError') {
      throw new ProviderError('timeout', `Tiempo agotado consultando ${host}`)
    }
    throw new ProviderError('unavailable', `No se pudo conectar con ${host}`)
  }
  if (response.status === 404) return null
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    const custom = options.classify?.(response.status, body)
    if (custom) throw custom
    if (response.status === 429) {
      const retry = Number(response.headers.get('retry-after'))
      throw new ProviderError('rate_limited', `${host} limitó las peticiones`, Number.isFinite(retry) ? retry : 30)
    }
    if (response.status >= 500) throw new ProviderError('unavailable', `${host} respondió ${response.status}`)
    throw new ProviderError('bad_response', `${host} respondió ${response.status}`)
  }
  try {
    return (await response.json()) as T
  } catch {
    throw new ProviderError('bad_response', `${host} devolvió JSON no válido`)
  }
}

/** Caché en memoria con caducidad, para no repetir consultas idénticas al proveedor. */
export class TtlCache<V> {
  private readonly store = new Map<string, { value: V; expires: number }>()

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 300,
  ) {}

  get(key: string): V | undefined {
    const hit = this.store.get(key)
    if (!hit) return undefined
    if (hit.expires < Date.now()) {
      this.store.delete(key)
      return undefined
    }
    return hit.value
  }

  set(key: string, value: V) {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value
      if (oldest !== undefined) this.store.delete(oldest)
    }
    this.store.set(key, { value, expires: Date.now() + this.ttlMs })
  }
}

export function parseYear(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const match = String(value).match(/\b(1[4-9]\d{2}|20\d{2})\b/)
  return match ? Number(match[1]) : null
}

/** Códigos MARC/ISO-639-2 de Open Library → ISO-639-1. */
const LANGUAGE_MAP: Record<string, string> = {
  spa: 'es', eng: 'en', fre: 'fr', fra: 'fr', por: 'pt', ger: 'de', deu: 'de', ita: 'it',
  cat: 'ca', glg: 'gl', baq: 'eu', eus: 'eu', lat: 'la', jpn: 'ja', chi: 'zh', rus: 'ru',
}

export function toLanguageCode(value: string | null | undefined): string | null {
  if (!value) return null
  const code = value.replace('/languages/', '').toLowerCase()
  if (code.length === 2) return code
  return LANGUAGE_MAP[code] ?? null
}

/** Quita HTML y Markdown sencillo de descripciones de proveedores. */
export function plainText(value: string | null | undefined): string | null {
  if (!value) return null
  const text = value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\*\*?([^*]+)\*\*?/g, '$1')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text || null
}
