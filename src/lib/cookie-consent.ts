/**
 * Inventario de cookies y elección del usuario sobre las opcionales.
 * Auditado: la aplicación solo usa cookies técnicas. Las categorías opcionales existen
 * para que cualquier herramienta futura se registre aquí con `inUse: true` y se cargue
 * únicamente a través de <ConsentGate>, nunca antes del consentimiento.
 */
export const CONSENT_COOKIE = 'gg_consent'
export const CONSENT_VERSION = 1
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 365

export type OptionalCategory = 'preferences' | 'analytics' | 'advertising'

export const COOKIE_CATEGORIES: {
  id: 'necessary' | OptionalCategory
  label: string
  description: string
  inUse: boolean
}[] = [
  {
    id: 'necessary',
    label: 'Técnicas (necesarias)',
    description: 'Sesión, avisos tras una acción y tu elección de cookies. Sin ellas no funciona lo que pides; no requieren consentimiento.',
    inUse: true,
  },
  { id: 'preferences', label: 'Preferencias', description: 'Recordar ajustes de visualización.', inUse: false },
  { id: 'analytics', label: 'Analítica y medición', description: 'Medir visitas de forma agregada.', inUse: false },
  { id: 'advertising', label: 'Publicidad y seguimiento', description: 'Anuncios o seguimiento entre sitios.', inUse: false },
]

export interface CookieChoice {
  v: number
  preferences: boolean
  analytics: boolean
  advertising: boolean
  at: string
}

export const OPTIONAL_IN_USE = COOKIE_CATEGORIES.some((c) => c.id !== 'necessary' && c.inUse)

export function parseChoice(raw: string | undefined | null): CookieChoice | null {
  if (!raw) return null
  try {
    const value = JSON.parse(decodeURIComponent(raw)) as CookieChoice
    if (value.v !== CONSENT_VERSION) return null
    return {
      v: value.v,
      preferences: value.preferences === true,
      analytics: value.analytics === true,
      advertising: value.advertising === true,
      at: String(value.at ?? ''),
    }
  } catch {
    return null
  }
}

/** Sin elección registrada, ninguna categoría opcional está permitida. */
export function isAllowed(choice: CookieChoice | null, category: OptionalCategory): boolean {
  return choice?.[category] === true
}

export function serializeChoice(choice: Omit<CookieChoice, 'v' | 'at'>): string {
  return encodeURIComponent(JSON.stringify({ v: CONSENT_VERSION, ...choice, at: new Date().toISOString() }))
}
