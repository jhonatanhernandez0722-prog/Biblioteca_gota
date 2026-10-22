/**
 * Reglas de préstamo de la biblioteca. El servidor las aplica en cada operación;
 * la interfaz solo las muestra.
 */
export const LOAN_RULES = {
  /** Días de préstamo desde la entrega del ejemplar. */
  loanDays: 21,
  /** Renovaciones permitidas por préstamo (cada una suma `loanDays`). */
  maxRenewals: 2,
  /** Días para recoger un ejemplar apartado tras la aprobación. */
  pickupDays: 3,
  /** Préstamos simultáneos por lector (solicitudes, apartados y en préstamo). */
  maxActiveLoans: 5,
  /** Reservas en espera simultáneas por lector. */
  maxActiveReservations: 3,
} as const

/** Días máximos que un lector puede tener un libro si renueva todas las veces. */
export const MAX_TOTAL_LOAN_DAYS = LOAN_RULES.loanDays * (LOAN_RULES.maxRenewals + 1)
