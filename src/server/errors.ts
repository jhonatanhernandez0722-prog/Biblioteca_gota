/**
 * Error de regla de negocio. Su mensaje está pensado para mostrarse tal cual
 * a la persona usuaria: dice qué pasó y cómo seguir.
 */
export class DomainError extends Error {
  readonly code: string
  readonly fieldErrors?: Record<string, string>

  constructor(message: string, code = 'domain_error', fieldErrors?: Record<string, string>) {
    super(message)
    this.name = 'DomainError'
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}
