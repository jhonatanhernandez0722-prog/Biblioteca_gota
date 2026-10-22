const NAMES: Record<string, string> = {
  es: 'Español',
  en: 'Inglés',
  fr: 'Francés',
  pt: 'Portugués',
  de: 'Alemán',
  it: 'Italiano',
  ca: 'Catalán',
  gl: 'Gallego',
  eu: 'Euskera',
  la: 'Latín',
  ja: 'Japonés',
  zh: 'Chino',
  ru: 'Ruso',
}

export function languageName(code: string | null | undefined): string {
  if (!code) return 'Sin indicar'
  return NAMES[code] ?? code.toUpperCase()
}

export const LANGUAGE_OPTIONS = Object.entries(NAMES).map(([code, name]) => ({ code, name }))
