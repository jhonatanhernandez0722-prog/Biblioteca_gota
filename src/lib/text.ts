/** Normaliza texto para búsquedas: sin tildes, en minúsculas y con espacios simples. */
export function normalizeText(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function slugify(input: string, maxLength = 80): string {
  const slug = normalizeText(input)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.slice(0, maxLength).replace(/-+$/g, '') || 'libro'
}

export function truncate(input: string, maxLength: number): string {
  if (input.length <= maxLength) return input
  const cut = input.slice(0, maxLength)
  const lastSpace = cut.lastIndexOf(' ')
  return `${cut.slice(0, lastSpace > maxLength * 0.6 ? lastSpace : maxLength).trimEnd()}…`
}

/** Une autores en lenguaje natural: «A», «A y B», «A, B y C». */
export function joinAuthors(authors: string[]): string {
  if (authors.length === 0) return 'Autoría desconocida'
  if (authors.length === 1) return authors[0]!
  return `${authors.slice(0, -1).join(', ')} y ${authors[authors.length - 1]}`
}

/** Plural sencillo en español. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

/** Similitud de Dice entre bigramas, para detectar posibles duplicados por título. */
export function similarity(a: string, b: string): number {
  const x = normalizeText(a).replace(/[^a-z0-9 ]/g, '')
  const y = normalizeText(b).replace(/[^a-z0-9 ]/g, '')
  if (!x || !y) return 0
  if (x === y) return 1
  const bigrams = (s: string) => {
    const map = new Map<string, number>()
    for (let i = 0; i < s.length - 1; i++) {
      const bg = s.slice(i, i + 2)
      map.set(bg, (map.get(bg) ?? 0) + 1)
    }
    return map
  }
  const bx = bigrams(x)
  const by = bigrams(y)
  let overlap = 0
  for (const [bg, count] of bx) overlap += Math.min(count, by.get(bg) ?? 0)
  return (2 * overlap) / (x.length - 1 + (y.length - 1))
}
