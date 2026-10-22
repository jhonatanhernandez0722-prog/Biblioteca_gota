/**
 * Reglas de préstamo de la biblioteca. El servidor las aplica en cada operación;
 * la interfaz solo las muestra.
 */
export const LOAN_RULES = {
  /**
   * Plazos de lectura que el lector puede elegir al pedir un libro (días desde la
   * entrega del ejemplar). El plazo elegido queda fijo al confirmar: no hay renovaciones.
   */
  loanPeriods: [7, 14, 21] as const,
  /** Plazo propuesto por defecto y el que reciben los préstamos antiguos sin plazo elegido. */
  defaultLoanDays: 14,
  /** Días para recoger un ejemplar apartado tras la aprobación. */
  pickupDays: 3,
  /** Préstamos simultáneos por lector (solicitudes, apartados y en préstamo). */
  maxActiveLoans: 5,
  /** Reservas en espera simultáneas por lector. */
  maxActiveReservations: 3,
} as const

export type LoanPeriod = (typeof LOAN_RULES.loanPeriods)[number]

/** Plazo más largo que se puede elegir. */
export const MAX_LOAN_DAYS = Math.max(...LOAN_RULES.loanPeriods)

export function isLoanPeriod(days: number): days is LoanPeriod {
  return (LOAN_RULES.loanPeriods as readonly number[]).includes(days)
}

/** Multas por mora: un valor fijo por cada día natural de retraso en la devolución. */
export const FINE_RULES = {
  /** Pesos colombianos por día de retraso. */
  dailyFine: 5_000,
  currency: 'COP',
} as const
