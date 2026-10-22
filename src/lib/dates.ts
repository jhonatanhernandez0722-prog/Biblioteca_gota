/**
 * Fechas de la biblioteca. Todas se guardan en UTC (ISO 8601) y se muestran
 * en la zona horaria de la biblioteca para que servidor y navegador coincidan.
 */
export const TIME_ZONE = process.env.NEXT_PUBLIC_LIBRARY_TIMEZONE || 'America/Bogota'
export const LOCALE = 'es-CO'

const DAY_MS = 86_400_000

function toDate(value: string | Date): Date {
  return typeof value === 'string' ? new Date(value) : value
}

export function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(toDate(value))
}

export function formatShortDate(value: string | Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
  })
    .format(toDate(value))
    .replace('.', '')
}

export function formatDateTime(value: string | Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(toDate(value))
}

/** Partes de calendario (año, mes, día) de un instante en la zona de la biblioteca. */
function zonedParts(date: Date, timeZone = TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}

/** Desfase en minutos de la zona respecto a UTC en un instante dado (p. ej. -300). */
function zoneOffsetMinutes(utcMs: number, timeZone = TIME_ZONE): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(new Date(utcMs))
    .find((p) => p.type === 'timeZoneName')?.value
  const match = name?.match(/GMT([+-])(\d{2}):(\d{2})/)
  if (!match) return 0
  const sign = match[1] === '-' ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3]))
}

/** Último instante del día natural (en la zona de la biblioteca) que contiene `date`. */
export function endOfLibraryDay(date: Date, timeZone = TIME_ZONE): Date {
  const { year, month, day } = zonedParts(date, timeZone)
  const guess = Date.UTC(year, month - 1, day, 23, 59, 59, 999)
  const offset = zoneOffsetMinutes(guess, timeZone)
  return new Date(guess - offset * 60_000)
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS)
}

/** Diferencia en días naturales (zona de la biblioteca) entre hoy y `value`. */
export function calendarDaysFrom(value: string | Date, now = new Date()): number {
  const a = zonedParts(now)
  const b = zonedParts(toDate(value))
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / DAY_MS)
}

/** Texto relativo para fechas de devolución: «vence hoy», «vence en 5 días», «venció hace 2 días». */
export function describeDue(value: string | Date, now = new Date()): string {
  const days = calendarDaysFrom(value, now)
  if (days === 0) return 'vence hoy'
  if (days === 1) return 'vence mañana'
  if (days > 1) return `vence en ${days} días`
  if (days === -1) return 'venció ayer'
  return `venció hace ${Math.abs(days)} días`
}

export function nowIso(): string {
  return new Date().toISOString()
}
