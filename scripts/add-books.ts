/**
 * Añade los libros de Junji Ito a una base de datos ya sembrada, importando
 * metadatos y portadas de Open Library. Omite los que ya existan.
 *
 *   npx tsx scripts/add-books.ts
 */
import { loadEnv } from './load-env'
import { JUNJI_ITO_BOOKS } from './seed-data'

loadEnv()

async function main() {
  const { env } = await import('@/server/env')
  const { get } = await import('@/server/db')
  const catalog = await import('@/server/catalog')
  const circulation = await import('@/server/circulation')
  const covers = await import('@/server/covers')
  const { OpenLibraryProvider } = await import('@/server/integrations/metadata/open-library')

  const staff = get<{ id: number }>(`SELECT id FROM users WHERE role IN ('librarian','admin') ORDER BY id LIMIT 1`)
  if (!staff) throw new Error('No hay personal de biblioteca: siembra primero la base de datos.')
  const provider = new OpenLibraryProvider(env().OPENLIBRARY_CONTACT_EMAIL)

  for (const seed of JUNJI_ITO_BOOKS) {
    if (get('SELECT id FROM books WHERE title = ?', [seed.title])) {
      console.log(`  · ${seed.title}: ya está en el catálogo`)
      continue
    }
    let details: Awaited<ReturnType<typeof provider.getDetails>> = null
    try {
      const page = await provider.search({ q: `${seed.title} Junji Ito`, mode: 'auto', page: 1 })
      const match = page.items.find((r) => r.language === 'es' && r.coverUrl) ?? page.items.find((r) => r.coverUrl) ?? page.items[0]
      if (match) {
        details = await provider.getDetails(match.providerId)
        if (details && !details.coverUrl && match.coverUrl) details = { ...details, coverUrl: match.coverUrl }
        if (details && !details.isbn13 && match.isbn13) details = { ...details, isbn13: match.isbn13 }
      }
    } catch (error) {
      console.warn(`  · ${seed.title}: sin respuesta de Open Library (${(error as Error).message})`)
    }
    const isbn = details?.isbn13 && !catalog.findPossibleDuplicates({ isbn: details.isbn13 }).exact.length ? details.isbn13 : null
    const { id } = catalog.createBook(
      {
        title: seed.title,
        authors: seed.authors,
        categories: seed.categories,
        description: seed.synopsis,
        publisher: details?.publisher ?? null,
        publishedYear: details?.year ?? seed.year,
        isbn,
        language: details?.language ?? 'es',
        pageCount: details?.pageCount ?? null,
        keywords: seed.keywords ?? null,
        featured: Boolean(seed.featured),
        sourceProvider: details ? 'openlibrary' : 'manual',
        sourceRef: details?.providerId ?? null,
        sourceUrl: details?.sourceUrl ?? null,
        isDemo: true,
      },
      staff.id,
    )
    if (details?.coverUrl) {
      try {
        const stored = await covers.storeCover(await covers.fetchRemoteCover(details.coverUrl), { rejectFlat: true })
        catalog.setBookCover(id, stored.key, stored.color, staff.id)
      } catch (error) {
        console.warn(`  · ${seed.title}: portada no disponible (${(error as Error).message})`)
      }
    }
    circulation.addCopies(staff.id, id, seed.copies, { location: 'Sala general, estante M (manga)' })
    console.log(`  ✓ ${seed.title}${details ? ` (${details.publisher ?? 's. e.'}, ${details.year ?? seed.year})` : ''}`)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
