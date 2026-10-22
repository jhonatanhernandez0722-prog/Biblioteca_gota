import { calendarDaysFrom, LOCALE } from './dates'
import { FINE_RULES } from './rules'

/**
 * Multas por mora. Multa = días de retraso × $5.000 COP.
 * Los días se cuentan en días naturales de la zona de la biblioteca: un préstamo
 * vence al final de su último día, así que devolverlo al día siguiente es 1 día de retraso.
 */

/** Días naturales de retraso entre la fecha de devolución pactada y `at` (0 si no hay retraso). */
export function lateDays(dueAt: string | Date, at: string | Date = new Date()): number {
  const due = typeof dueAt === 'string' ? new Date(dueAt) : dueAt
  const when = typeof at === 'string' ? new Date(at) : at
  if (when.getTime() <= due.getTime()) return 0
  return Math.max(1, -calendarDaysFrom(due, when))
}

export function fineAmount(days: number): number {
  return Math.max(0, Math.trunc(days)) * FINE_RULES.dailyFine
}

/** Multa acumulada de un préstamo a la fecha `at`. */
export function accruedFine(dueAt: string | Date, at: string | Date = new Date()) {
  const days = lateDays(dueAt, at)
  return { days, amount: fineAmount(days) }
}

const COP = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: FINE_RULES.currency,
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
})

/** «$ 15.000» */
export function formatCOP(amount: number): string {
  return COP.format(amount)
}

export function describeLate(days: number): string {
  return days === 1 ? '1 día de retraso' : `${days} días de retraso`
}
