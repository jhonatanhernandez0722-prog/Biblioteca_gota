import './setup'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { accruedFine, fineAmount, formatCOP, lateDays } from '@/lib/fines'
import {
  cardBrand,
  formatCardInput,
  luhn,
  normalizeLoanCard,
  normalizePhone,
  validateCreditCard,
  validateDocument,
  validateLoanCard,
} from '@/lib/identity'
import { LEGAL_DOCUMENTS, LEGAL_HISTORY } from '@/lib/legal'
import { FINE_RULES } from '@/lib/rules'
import { createBook, searchFacets } from '@/server/catalog'
import { documentHash } from '@/server/consents'
import { all, get } from '@/server/db'
import { isDomainError } from '@/server/errors'
import { QueryCache, cachedCatalogSearch, invalidateSearchCache, SEARCH_CACHE_CAPACITY, searchCacheSize } from '@/server/search-cache'
import { getReaderIdentity, registerUser, updateIdentity } from '@/server/users'


describe('Multas por mora', () => {
  it('multa = días de retraso × $5.000 COP (ejemplos del requerimiento)', () => {
    assert.equal(FINE_RULES.dailyFine, 5000)
    assert.equal(fineAmount(1), 5_000)
    assert.equal(fineAmount(3), 15_000)
    assert.equal(fineAmount(7), 35_000)
    assert.equal(fineAmount(10), 50_000)
    assert.equal(fineAmount(0), 0)
  })

  it('cuenta días naturales de la zona de la biblioteca', () => {
    // Vence al final del 10 de marzo en Bogotá (UTC−5) = 11 de marzo 04:59:59.999 UTC.
    const due = '2026-03-11T04:59:59.999Z'
    assert.equal(lateDays(due, '2026-03-10T20:00:00Z'), 0, 'antes de vencer')
    assert.equal(lateDays(due, '2026-03-11T04:59:59.999Z'), 0, 'en el último instante del plazo')
    assert.equal(lateDays(due, '2026-03-11T05:00:00Z'), 1, 'medianoche en Bogotá: primer día de retraso')
    assert.equal(lateDays(due, '2026-03-13T15:00:00Z'), 3)
    assert.deepEqual(accruedFine(due, '2026-03-20T15:00:00Z'), { days: 10, amount: 50_000 })
  })

  it('formatea en pesos colombianos sin decimales', () => {
    assert.match(formatCOP(15_000), /^\$\s?15\.000$/)
  })
})

describe('Datos de identificación', () => {
  it('teléfono colombiano: celular o fijo, con o sin +57', () => {
    assert.equal(normalizePhone('300 123 4567'), '3001234567')
    assert.equal(normalizePhone('+57 (601) 555 1234'), '6015551234')
    assert.equal(normalizePhone('12345'), null)
    assert.equal(normalizePhone('2001234567'), null)
  })

  it('documento: CC de 6 a 10 dígitos, TI de 10 u 11', () => {
    assert.deepEqual(validateDocument('CC', '52.123.456'), { ok: true, number: '52123456' })
    assert.equal(validateDocument('CC', '123').ok, false)
    assert.equal(validateDocument('TI', '1012345678').ok, true)
    assert.equal(validateDocument('TI', '52123456').ok, false)
    assert.equal(validateDocument('CE', '52123456').ok, false)
    assert.equal(validateDocument('CC', '0123456').ok, false)
  })

  it('tarjeta: Luhn, franquicia y agrupación al escribir', () => {
    assert.equal(luhn('4242424242424242'), true)
    assert.equal(luhn('4242424242424241'), false)
    assert.equal(cardBrand('4242424242424242'), 'visa')
    assert.equal(cardBrand('5555555555554444'), 'mastercard')
    assert.equal(cardBrand('2223003122003222'), 'mastercard')
    assert.equal(cardBrand('378282246310005'), 'amex')
    assert.deepEqual(validateCreditCard('4242 4242 4242 4242'), { ok: true, brand: 'visa', last4: '4242' })
    assert.equal(validateCreditCard('4242 4242 4242 4241').ok, false)
    assert.equal(validateCreditCard('4242-abcd').ok, false)
    assert.equal(formatCardInput('4242424242424242'), '4242 4242 4242 4242')
    assert.equal(formatCardInput('378282246310005'), '3782 822463 10005')
  })

  it('carné: normaliza y valida el formato', () => {
    assert.equal(normalizeLoanCard(' gg-26-00042 '), 'GG-26-00042')
    assert.equal(validateLoanCard('GG-26-00042').ok, true)
    assert.equal(validateLoanCard('ab').ok, false)
    assert.equal(validateLoanCard('GG 26 <script>').ok, false)
  })

  it('nunca guarda el número completo de la tarjeta y no repite documentos', async () => {
    const card = '5555 5555 5555 4444'
    const user = await registerUser({
      name: 'Ivón',
      email: 'ivon@test.example',
      password: 'clave-segura-123',
      identity: { phone: '3109876543', documentType: 'CC', documentNumber: '1020304050', creditCard: card },
    })
    const identity = await getReaderIdentity(user.id)
    assert.deepEqual(
      { brand: identity.cardBrand, last4: identity.cardLast4, complete: identity.complete },
      { brand: 'mastercard', last4: '4444', complete: true },
    )
    const row = await get<Record<string, unknown>>('SELECT * FROM users WHERE id = ?', [user.id])
    const audit = await all<{ summary: string; details: string | null }>('SELECT summary, details FROM audit_log')
    for (const value of [...Object.values(row!), ...audit.flatMap((a) => [a.summary, a.details])]) {
      assert.ok(!String(value).includes('5555555555554444'), 'el número completo no está en la base de datos')
    }

    await assert.rejects(
      registerUser({
        name: 'Otra',
        email: 'otra@test.example',
        password: 'clave-segura-123',
        identity: { phone: '3109876543', documentType: 'CC', documentNumber: '1.020.304.050', creditCard: card },
      }),
      (e: unknown) => isDomainError(e) && e.code === 'document_taken',
    )
    await assert.rejects(
      updateIdentity(user.id, { phone: '1', documentType: 'TI', documentNumber: '12', creditCard: '1234' }),
      (e: unknown) =>
        isDomainError(e) && Boolean(e.fieldErrors?.phone && e.fieldErrors?.documentNumber && e.fieldErrors?.creditCard),
    )
  })
})

describe('Documentos legales', () => {
  it('las versiones anteriores conservan exactamente su contenido publicado', () => {
    assert.equal(LEGAL_DOCUMENTS.terminos.version, '1.1')
    const [terms10] = LEGAL_HISTORY.terminos
    assert.equal(documentHash(terms10!), 'e928c73992d965a882676a9649f9c33803237cd0d4df953fac87dd7383db2b97')
    assert.equal(documentHash(LEGAL_HISTORY.privacidad[0]!), 'b99fdb973ee7cdcf3e1a0fda7b9f2dc3fcc103e7282d16bb8aacdc1729e02365')
    assert.equal(documentHash(LEGAL_HISTORY.reembolsos[0]!), '6428eae80a66a20d60b2048bf74084aecf58ec6a12118f2abfff8e5b249f37fd')
  })
})

describe('Buscador: contadores dinámicos y capacidad', () => {
  it('los contadores de cada filtro responden a la búsqueda y a los demás filtros', async () => {
    const make = (title: string, categories: string[], language: string) =>
      createBook({ title, authors: ['Facetas'], categories, language }, null)
    await make('Mar de fondo', ['Poesía', 'Viajes'], 'es')
    await make('Mar abierto', ['Viajes'], 'en')
    await make('Montaña', ['Viajes'], 'es')

    const all = await searchFacets({})
    assert.equal(all.categories.viajes, 3)
    assert.equal(all.categories.poesia, 1)

    const mar = await searchFacets({ q: 'mar' })
    assert.equal(mar.categories.viajes, 2, 'la búsqueda reduce el contador')
    assert.equal(mar.categories.poesia, 1)
    assert.deepEqual(mar.languages, { es: 1, en: 1 })

    // Con una categoría elegida, su propio contador no se anula: muestra las alternativas.
    const marPoesia = await searchFacets({ q: 'mar', category: 'poesia' })
    assert.equal(marPoesia.categories.viajes, 2)
    assert.deepEqual(marPoesia.languages, { es: 1 }, 'el idioma sí respeta la categoría')
    assert.equal(marPoesia.availability.all, 1)
    assert.equal(marPoesia.availability.available, 0, 'sin ejemplares no hay disponibles')
  })

  it(`atiende ${SEARCH_CACHE_CAPACITY} consultas, comparte las simultáneas y no crece sin límite`, async () => {
    invalidateSearchCache()
    const queries = Array.from({ length: SEARCH_CACHE_CAPACITY }, (_, i) => ['mar', 'Mar ', 'montaña', 'MAR', 'fondo'][i % 5]!)
    const started = Date.now()
    const results = await Promise.all(queries.map((q) => cachedCatalogSearch({ q })))
    assert.equal(results.length, SEARCH_CACHE_CAPACITY)
    assert.ok(results.every((r) => r.result.total >= 0))
    assert.equal(results[0], results[1], '«mar» y «Mar » comparten la misma consulta')
    assert.ok(searchCacheSize() <= 3, `solo 3 consultas distintas; hay ${searchCacheSize()}`)
    assert.ok(Date.now() - started < 30_000)

    // LRU: con más consultas distintas que la capacidad, descarta las más antiguas.
    let loads = 0
    const small = new QueryCache<number>(3, 60_000)
    for (const key of ['a', 'b', 'c', 'a', 'd']) await small.get(key, async () => ++loads)
    assert.equal(small.size, 3)
    assert.equal(loads, 4, 'la segunda «a» se sirvió de la caché')
    assert.equal(await small.get('a', async () => ++loads), 1, '«a» se usó hace poco y sigue')
    assert.equal(await small.get('b', async () => ++loads), 5, '«b» era la menos usada y se descartó')

    // Un error no se queda en la caché.
    await assert.rejects(small.get('x', async () => Promise.reject(new Error('caída'))))
    assert.equal(await small.get('x', async () => 42), 42)
  })

  it('invalidar la caché refleja los cambios del catálogo al momento', async () => {
    const before = (await cachedCatalogSearch({ q: 'zafiro' })).result.total
    await createBook({ title: 'Zafiro', authors: ['Facetas'], categories: [] }, null)
    assert.equal((await cachedCatalogSearch({ q: 'zafiro' })).result.total, before, 'sin invalidar, sirve la caché')
    invalidateSearchCache()
    assert.equal((await cachedCatalogSearch({ q: 'zafiro' })).result.total, before + 1)
  })
})
