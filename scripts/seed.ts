/**
 * Siembra la base de datos con el catálogo de demostración.
 *
 *   npm run db:seed            → solo si la base de datos está vacía
 *   npm run db:seed -- --reset → borra base de datos y portadas, y vuelve a sembrar
 *   npm run db:seed -- --offline → no consulta Open Library (portadas tipográficas)
 *
 * Los metadatos y portadas se importan de Open Library con el mismo adaptador que usa
 * el panel. Ejemplares, lectores y préstamos son ficticios y quedan marcados como demo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadEnv } from './load-env'
import { DEMO_USERS, EDITORIAL_PICK, JUNJI_ITO_BOOKS, SEED_BOOKS as BASE_BOOKS } from './seed-data'

const SEED_BOOKS = [...BASE_BOOKS, ...JUNJI_ITO_BOOKS]

loadEnv()

async function main() {
  const args = new Set(process.argv.slice(2))
  if (process.env.NODE_ENV === 'production' && !args.has('--force')) {
    throw new Error('No se siembran datos de demostración en producción (usa --force si de verdad quieres hacerlo).')
  }

  const { env, resolveFromRoot } = await import('@/server/env')
  if (args.has('--reset')) {
    fs.rmSync(path.join(resolveFromRoot(env().STORAGE_DIR), 'covers'), { recursive: true, force: true })
    console.log('Portadas borradas.')
  }

  const { get, run, transaction } = await import('@/server/db')
  const users = await import('@/server/users')
  const catalog = await import('@/server/catalog')
  const circulation = await import('@/server/circulation')
  const covers = await import('@/server/covers')
  const { OpenLibraryProvider } = await import('@/server/integrations/metadata/open-library')

  if (((await get<{ n: number }>('SELECT COUNT(*) AS n FROM users'))?.n ?? 0) > 0) {
    console.log('La base de datos ya tiene datos. Usa `npm run db:seed -- --reset` para empezar de cero.')
    return
  }

  /* Usuarios de demostración */
  const ids: Record<string, number> = {}
  for (const [i, u] of DEMO_USERS.entries()) {
    // Datos ficticios: tarjeta de pruebas Visa (pasa Luhn, no existe) y documentos inventados.
    const identity = {
      phone: `30${String(10_000_000 + i * 1_234_567).slice(0, 8)}`,
      documentType: 'CC',
      documentNumber: String(80_000_000 + i * 111_111),
      creditCard: '4242 4242 4242 4242',
    }
    const created = await users.registerUser({ ...u, isDemo: true, identity, consents: { source: 'semilla:demo' } })
    ids[u.key] = created.id
  }
  const staffId = ids.librarian!
  console.log(`Usuarios creados: ${DEMO_USERS.length}`)

  /* Catálogo */
  const provider = new OpenLibraryProvider(env().OPENLIBRARY_CONTACT_EMAIL)
  const offline = args.has('--offline')
  const bookIds: Record<string, number> = {}
  let withCover = 0

  for (const [index, seed] of SEED_BOOKS.entries()) {
    let details: Awaited<ReturnType<typeof provider.getDetails>> = null
    let fallbackIsbn: string | null = null
    if (!offline) {
      try {
        const query = `${seed.title} ${seed.authors[0]?.split(' ').slice(-1)[0] ?? ''}`
        const page = await provider.search({ q: query, mode: 'auto', page: 1 })
        const match =
          page.items.find((r) => r.language === 'es' && r.coverUrl) ?? page.items.find((r) => r.coverUrl) ?? page.items[0]
        if (match) {
          fallbackIsbn = match.isbn13
          details = await provider.getDetails(match.providerId)
          if (details && !details.coverUrl && match.coverUrl) details = { ...details, coverUrl: match.coverUrl }
        }
      } catch (error) {
        console.warn(`  · ${seed.title}: sin respuesta de Open Library (${(error as Error).message})`)
      }
    }

    const isbn = details?.isbn13 ?? fallbackIsbn
    const isbnTaken = isbn ? (await catalog.findPossibleDuplicates({ isbn })).exact.length > 0 : false
    const { id } = await catalog.createBook(
      {
        title: seed.title,
        authors: seed.authors,
        categories: seed.categories,
        description: seed.synopsis,
        publisher: details?.publisher ?? null,
        publishedYear: details?.year ?? seed.year,
        isbn: isbnTaken ? null : isbn,
        language: details?.language ?? 'es',
        pageCount: details?.pageCount ?? seed.pages ?? null,
        keywords: seed.keywords ?? null,
        featured: Boolean(seed.featured),
        editorialPick: seed.key === EDITORIAL_PICK.key,
        editorialNote: seed.key === EDITORIAL_PICK.key ? EDITORIAL_PICK.note : null,
        editorialQuote: seed.key === EDITORIAL_PICK.key ? EDITORIAL_PICK.quote : null,
        sourceProvider: details ? 'openlibrary' : 'manual',
        sourceRef: details?.providerId ?? null,
        sourceUrl: details?.sourceUrl ?? null,
        isDemo: true,
      },
      staffId,
    )
    bookIds[seed.key] = id

    if (details?.coverUrl) {
      try {
        const buffer = await covers.fetchRemoteCover(details.coverUrl)
        const stored = await covers.storeCover(buffer, { rejectFlat: true })
        await catalog.setBookCover(id, stored.key, stored.color, staffId)
        withCover++
      } catch (error) {
        console.warn(`  · ${seed.title}: portada no disponible (${(error as Error).message})`)
      }
    }
    await circulation.addCopies(staffId, id, seed.copies, {
      location: `Sala general, estante ${String.fromCharCode(65 + (index % 8))}`,
    })
    console.log(`  ✓ ${seed.title}${details ? ` (${details.publisher ?? 's. e.'}, ${details.year ?? seed.year})` : ''}`)
  }
  console.log(`Libros: ${SEED_BOOKS.length} · con portada de Open Library: ${withCover}`)

  /* Fechas de incorporación repartidas en los últimos 70 días, en un orden estable pero mezclado. */
  const scramble = (key: string) => [...key].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381)
  const ordered = [...SEED_BOOKS].sort((a, b) => scramble(a.key) - scramble(b.key))
  for (const [i, seed] of ordered.entries()) {
    const daysAgo = Math.round(70 - (i * 68) / ordered.length)
    const date = new Date(Date.now() - daysAgo * 86_400_000 - (i % 5) * 3_600_000).toISOString()
    await run('UPDATE books SET created_at = ?, updated_at = ? WHERE id = ?', [date, date, bookIds[seed.key]!])
    await run('UPDATE copies SET acquired_at = ?, created_at = ? WHERE book_id = ?', [date, date, bookIds[seed.key]!])
  }

  /* Circulación de demostración, con las mismas reglas que la aplicación. */
  const day = 86_400_000
  /** El plazo es inmutable: mover fechas al pasado es una corrección explícita de datos de demostración. */
  const backdate = async (loanId: number, checkedOutDaysAgo: number, loanDays: number) => {
    const out = new Date(Date.now() - checkedOutDaysAgo * day)
    const requested = new Date(out.getTime() - 2 * day)
    const due = new Date(out.getTime() + loanDays * day)
    await transaction(async () => {
      await run(`SELECT set_config('gotagota.term_override', 'on', true)`)
      await run(
        `UPDATE loans SET requested_at = ?, decided_at = ?, checked_out_at = ?, due_at = ?, is_demo = TRUE WHERE id = ?`,
        [requested.toISOString(), requested.toISOString(), out.toISOString(), due.toISOString(), loanId],
      )
    })
  }
  const lend = async (userKey: string, bookKey: string, daysAgo: number, loanDays: 7 | 14 | 21) => {
    const { loanId } = await circulation.requestLoan(ids[userKey]!, bookIds[bookKey]!, { loanDays })
    await circulation.approveLoan(staffId, loanId)
    await circulation.checkoutLoan(staffId, loanId)
    await backdate(loanId, daysAgo, loanDays)
    return loanId
  }

  await lend('samuel', 'cien-anos', 11, 21)
  await lend('camila', 'cien-anos', 6, 14)
  await lend('samuel', '1984', 17, 14) // vencido hace 3 días: multa acumulada de $15.000
  await lend('reader', 'rayuela', 5, 7)
  // Préstamo antiguo devuelto a tiempo: se devuelve hoy (sin multa) y luego se fechan en el pasado.
  const returned = await lend('reader', 'principito', 0, 21)
  await circulation.returnLoan(staffId, returned)
  await backdate(returned, 40, 21)
  await run('UPDATE loans SET returned_at = ?, updated_at = ? WHERE id = ?', [
    new Date(Date.now() - 22 * day).toISOString(),
    new Date(Date.now() - 22 * day).toISOString(),
    returned,
  ])
  await circulation.requestLoan(ids.camila!, bookIds.ficciones!, { loanDays: 7 })
  // Una devolución tardía ya cerrada: deja a Camila con una multa de 2 días por pagar.
  const lateReturn = await lend('camila', 'principito', 16, 14)
  await circulation.returnLoan(staffId, lateReturn)
  const ready = await circulation.requestLoan(ids.reader!, bookIds['sombra-viento']!, { loanDays: 21 })
  await circulation.approveLoan(staffId, ready.loanId)
  await circulation.requestLoan(ids.reader!, bookIds.cosmos!, { loanDays: 14, cardNumber: 'UNAL-2026-0042' })
  await circulation.reserveBook(ids.reader!, bookIds['cien-anos']!, { loanDays: 14 })
  await run('UPDATE fines SET is_demo = TRUE')
  await run('UPDATE loans SET is_demo = TRUE')
  console.log('Circulación de demostración creada.')

  console.log('\nCuentas de demostración:')
  for (const u of DEMO_USERS) console.log(`  ${u.role.padEnd(9)} ${u.email.padEnd(30)} ${u.password}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
