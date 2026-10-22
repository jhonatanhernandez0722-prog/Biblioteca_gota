/**
 * Datos que habilitan a un lector para pedir préstamos: teléfono, documento de
 * identidad (CC o TI) y tarjeta de crédito. Las mismas reglas validan en el navegador
 * (mientras se escribe) y en el servidor (siempre).
 *
 * De la tarjeta NUNCA se guarda el número completo: solo la franquicia y los
 * últimos cuatro dígitos (PCI DSS). Tampoco se pide CVV ni fecha de vencimiento.
 */

export type DocumentType = 'CC' | 'TI'

export const DOCUMENT_TYPES: Record<DocumentType, { label: string; short: string; min: number; max: number }> = {
  CC: { label: 'Cédula de ciudadanía', short: 'CC', min: 6, max: 10 },
  TI: { label: 'Tarjeta de identidad', short: 'TI', min: 10, max: 11 },
}

export function isDocumentType(value: string): value is DocumentType {
  return value === 'CC' || value === 'TI'
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/* ───────────── Teléfono (Colombia) ───────────── */

/**
 * Celular (3xx xxx xxxx) o fijo nacional (60x xxx xxxx), con o sin +57.
 * Devuelve los 10 dígitos o null si no es válido.
 */
export function normalizePhone(value: string): string | null {
  let digits = digitsOnly(value)
  if (digits.length === 12 && digits.startsWith('57')) digits = digits.slice(2)
  if (digits.length !== 10) return null
  return /^(3\d{9}|60\d{8})$/.test(digits) ? digits : null
}

export function formatPhone(digits: string): string {
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`
}

/* ───────────── Documento de identidad ───────────── */

export function validateDocument(type: string, value: string): { ok: true; number: string } | { ok: false; message: string } {
  if (!isDocumentType(type)) return { ok: false, message: 'Elige el tipo de documento: CC o TI.' }
  const number = digitsOnly(value)
  const rule = DOCUMENT_TYPES[type]
  if (!number) return { ok: false, message: 'Escribe el número de tu documento.' }
  if (number.length < rule.min || number.length > rule.max) {
    return {
      ok: false,
      message:
        rule.min === rule.max
          ? `La ${rule.label.toLowerCase()} tiene ${rule.min} dígitos.`
          : `La ${rule.label.toLowerCase()} tiene entre ${rule.min} y ${rule.max} dígitos.`,
    }
  }
  if (/^0/.test(number)) return { ok: false, message: 'El número de documento no empieza por 0.' }
  return { ok: true, number }
}

export function maskDocument(type: DocumentType, number: string): string {
  return `${type} ••••${number.slice(-4)}`
}

/* ───────────── Tarjeta de crédito ───────────── */

export type CardBrand = 'visa' | 'mastercard' | 'amex' | 'diners' | 'discover' | 'other'

export const CARD_BRAND_LABEL: Record<CardBrand, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'American Express',
  diners: 'Diners Club',
  discover: 'Discover',
  other: 'Tarjeta',
}

export function cardBrand(digits: string): CardBrand {
  if (/^4/.test(digits)) return 'visa'
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(digits)) return 'mastercard'
  if (/^3[47]/.test(digits)) return 'amex'
  if (/^3(0[0-5]|[689])/.test(digits)) return 'diners'
  if (/^6(011|5)/.test(digits)) return 'discover'
  return 'other'
}

/** Algoritmo de Luhn: detecta errores de tecleo en el número de la tarjeta. */
export function luhn(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (d < 0 || d > 9) return false
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return digits.length > 0 && sum % 10 === 0
}

export function validateCreditCard(
  value: string,
): { ok: true; brand: CardBrand; last4: string } | { ok: false; message: string } {
  if (/[^\d\s-]/.test(value)) return { ok: false, message: 'Usa solo números (puedes separarlos con espacios).' }
  const digits = digitsOnly(value)
  if (!digits) return { ok: false, message: 'Escribe el número de tu tarjeta de crédito.' }
  if (digits.length < 14 || digits.length > 19) return { ok: false, message: 'El número de la tarjeta tiene entre 14 y 19 dígitos.' }
  if (!luhn(digits)) return { ok: false, message: 'Ese número de tarjeta no es válido. Revisa los dígitos.' }
  return { ok: true, brand: cardBrand(digits), last4: digits.slice(-4) }
}

/** Agrupa los dígitos como aparecen en la tarjeta: 4-4-4-4, o 4-6-5 en American Express. */
export function formatCardInput(value: string): string {
  const digits = digitsOnly(value).slice(0, 19)
  const groups = cardBrand(digits) === 'amex' ? [4, 6, 5] : [4, 4, 4, 4, 3]
  const out: string[] = []
  let i = 0
  for (const size of groups) {
    if (i >= digits.length) break
    out.push(digits.slice(i, i + size))
    i += size
  }
  return out.join(' ')
}

export function describeCard(brand: CardBrand, last4: string): string {
  return `${CARD_BRAND_LABEL[brand]} terminada en ${last4}`
}

/* ───────────── Carné de préstamo ───────────── */

/** Normaliza un número de carné: mayúsculas, sin espacios. Ej.: «gg-26-00042» → «GG-26-00042». */
export function normalizeLoanCard(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, '')
}

export function validateLoanCard(value: string): { ok: true; number: string } | { ok: false; message: string } {
  const number = normalizeLoanCard(value)
  if (!number) return { ok: false, message: 'Escribe el número del carné.' }
  if (!/^[A-Z0-9][A-Z0-9-]{4,22}[A-Z0-9]$/.test(number)) {
    return { ok: false, message: 'El carné tiene entre 6 y 24 letras, números o guiones (por ejemplo, GG-26-00042).' }
  }
  return { ok: true, number }
}
