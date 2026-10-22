/** Utilidades de ISBN compartidas por servidor y cliente. */

export function cleanIsbn(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

export function isValidIsbn10(value: string): boolean {
  if (!/^\d{9}[\dX]$/.test(value)) return false
  let sum = 0
  for (let i = 0; i < 10; i++) {
    const char = value[i]!
    const digit = char === 'X' ? 10 : Number(char)
    sum += digit * (10 - i)
  }
  return sum % 11 === 0
}

export function isValidIsbn13(value: string): boolean {
  if (!/^\d{13}$/.test(value)) return false
  let sum = 0
  for (let i = 0; i < 13; i++) {
    sum += Number(value[i]) * (i % 2 === 0 ? 1 : 3)
  }
  return sum % 10 === 0
}

export function isbn10To13(isbn10: string): string {
  const core = `978${isbn10.slice(0, 9)}`
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(core[i]) * (i % 2 === 0 ? 1 : 3)
  const check = (10 - (sum % 10)) % 10
  return `${core}${check}`
}

export function isbn13To10(isbn13: string): string | null {
  if (!isbn13.startsWith('978')) return null
  const core = isbn13.slice(3, 12)
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(core[i]) * (10 - i)
  const check = (11 - (sum % 11)) % 11
  return `${core}${check === 10 ? 'X' : check}`
}

export interface NormalizedIsbn {
  isbn13: string
  isbn10: string | null
}

/** Devuelve el ISBN normalizado en sus dos formas, o null si no es un ISBN válido. */
export function normalizeIsbn(input: string | null | undefined): NormalizedIsbn | null {
  if (!input) return null
  const value = cleanIsbn(input)
  if (value.length === 13 && isValidIsbn13(value)) {
    return { isbn13: value, isbn10: isbn13To10(value) }
  }
  if (value.length === 10 && isValidIsbn10(value)) {
    return { isbn13: isbn10To13(value), isbn10: value }
  }
  return null
}

/** ¿Parece el texto un ISBN (aunque esté escrito con guiones o espacios)? */
export function looksLikeIsbn(input: string): boolean {
  const value = cleanIsbn(input)
  return /^(\d{9}[\dX]|\d{13})$/.test(value)
}
