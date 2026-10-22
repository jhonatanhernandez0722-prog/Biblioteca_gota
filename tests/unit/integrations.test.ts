import './setup'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import sharp from 'sharp'
import { isAllowedCoverUrl, processCoverImage, storeCover } from '@/server/covers'
import { isDomainError } from '@/server/errors'
import { GoogleBooksProvider } from '@/server/integrations/metadata/google-books'
import { OpenLibraryProvider } from '@/server/integrations/metadata/open-library'
import { ProviderError } from '@/server/integrations/metadata/types'
import { getStorage } from '@/server/integrations/storage'

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

/** Sustituye fetch por un enrutador de respuestas simuladas. */
function mockFetch(routes: Record<string, () => Response>) {
  const calls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input instanceof Request ? input.url : input)
    calls.push(url)
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (!key) return new Response('no encontrado', { status: 404 })
    return routes[key]!()
  }) as typeof fetch
  return calls
}

const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...headers } })

describe('Open Library', () => {
  it('convierte resultados de búsqueda y prefiere la edición encontrada', async () => {
    mockFetch({
      '/search.json': () =>
        json({
          numFound: 1,
          docs: [
            {
              key: '/works/OL14860424W',
              title: 'Rayuela',
              author_name: ['Julio Cortázar'],
              first_publish_year: 1963,
              cover_i: 1047466,
              edition_count: 129,
              editions: {
                docs: [
                  {
                    key: '/books/OL47684105M',
                    title: 'Rayuela',
                    cover_i: 15103307,
                    language: ['spa'],
                    publisher: ['Alfaguara'],
                    publish_date: ['2000'],
                    isbn: ['9681902009', '9789681902001'],
                  },
                ],
              },
            },
          ],
        }),
    })
    const provider = new OpenLibraryProvider()
    const page = await provider.search({ q: 'rayuela', mode: 'auto', page: 1 })
    assert.equal(page.total, 1)
    const [item] = page.items
    assert.equal(item?.providerId, 'OL47684105M')
    assert.equal(item?.isbn13, '9789681902001')
    assert.equal(item?.year, 2000)
    assert.equal(item?.language, 'es')
    assert.equal(item?.publisher, 'Alfaguara')
    assert.equal(item?.coverUrl, 'https://covers.openlibrary.org/b/id/15103307-L.jpg')
  })

  it('busca por ISBN normalizado cuando la consulta lo parece', async () => {
    const calls = mockFetch({ '/search.json': () => json({ numFound: 0, docs: [] }) })
    await new OpenLibraryProvider().search({ q: '84-376-0457-5', mode: 'auto', page: 1 })
    assert.match(decodeURIComponent(calls[0]!), /q=isbn:9788437604572/)
  })

  it('reúne edición, obra y autores en el detalle', async () => {
    mockFetch({
      '/books/OL19845805M.json': () =>
        json({
          title: 'Rayuela',
          publishers: ['Cátedra'],
          publish_date: '1984',
          number_of_pages: 746,
          isbn_10: ['8437604575'],
          covers: [15103185],
          works: [{ key: '/works/OL14860424W' }],
          authors: [{ key: '/authors/OL2631008A' }],
          languages: [{ key: '/languages/spa' }],
        }),
      '/works/OL14860424W.json': () =>
        json({
          description: { value: '*Rayuela* es una novela.\r\nFuente: https://es.wikipedia.org/wiki/Rayuela' },
          subjects: ['Novela', 'Literatura argentina'],
        }),
      '/authors/OL2631008A.json': () => json({ name: 'Julio Cortázar' }),
    })
    const details = await new OpenLibraryProvider().getDetails('OL19845805M')
    assert.ok(details)
    assert.equal(details.isbn13, '9788437604572')
    assert.equal(details.isbn10, '8437604575')
    assert.equal(details.pageCount, 746)
    assert.deepEqual(details.authors, ['Julio Cortázar'])
    assert.equal(details.description?.startsWith('Rayuela es una novela.'), true)
    assert.equal(details.descriptionSource, 'https://es.wikipedia.org/wiki/Rayuela')
    assert.deepEqual(details.subjects, ['Novela', 'Literatura argentina'])
  })

  it('rechaza identificadores con formato extraño sin llamar al proveedor', async () => {
    const calls = mockFetch({})
    assert.equal(await new OpenLibraryProvider().getDetails('../../etc/passwd'), null)
    assert.equal(calls.length, 0)
  })

  it('traduce el límite de peticiones y las caídas a errores tipados', async () => {
    mockFetch({ '/search.json': () => json({}, 429, { 'Retry-After': '12' }) })
    await assert.rejects(new OpenLibraryProvider().search({ q: 'abc', mode: 'title', page: 1 }), (error: unknown) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'rate_limited')
      assert.equal(error.retryAfterSeconds, 12)
      return true
    })
    mockFetch({ '/search.json': () => new Response('error', { status: 503 }) })
    await assert.rejects(new OpenLibraryProvider().search({ q: 'abcd', mode: 'title', page: 1 }), (error: unknown) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'unavailable')
      return true
    })
  })

  it('agota el tiempo de espera con un error claro', async () => {
    globalThis.fetch = (async () => {
      throw Object.assign(new Error('timeout'), { name: 'TimeoutError' })
    }) as typeof fetch
    await assert.rejects(new OpenLibraryProvider().search({ q: 'lento', mode: 'title', page: 1 }), (error: unknown) => {
      assert.ok(error instanceof ProviderError)
      assert.equal(error.code, 'timeout')
      return true
    })
  })
})

describe('Google Books', () => {
  it('no funciona sin clave y lo dice', async () => {
    const provider = new GoogleBooksProvider()
    assert.equal(provider.info.configured, false)
    await assert.rejects(provider.search({ q: 'x', mode: 'auto', page: 1 }), (e: unknown) => {
      assert.ok(e instanceof ProviderError)
      assert.equal(e.code, 'not_configured')
      return true
    })
  })

  it('convierte volúmenes y detecta la cuota agotada', async () => {
    mockFetch({
      '/volumes?': () =>
        json({
          totalItems: 1,
          items: [
            {
              id: 'abc123XYZ',
              volumeInfo: {
                title: 'Delirio',
                authors: ['Laura Restrepo'],
                publishedDate: '2004-03-01',
                industryIdentifiers: [{ type: 'ISBN_13', identifier: '9789587041453' }],
                imageLinks: { thumbnail: 'http://books.google.com/books/content?id=abc&img=1&zoom=1&edge=curl' },
                language: 'es',
              },
            },
          ],
        }),
    })
    const provider = new GoogleBooksProvider('clave-de-prueba')
    const page = await provider.search({ q: 'delirio', mode: 'title', page: 1 })
    assert.equal(page.items[0]?.isbn13, '9789587041453')
    assert.equal(page.items[0]?.year, 2004)
    assert.ok(page.items[0]?.coverUrl?.startsWith('https://books.google.com/'))
    assert.ok(!page.items[0]?.coverUrl?.includes('edge=curl'))

    mockFetch({ '/volumes?': () => json({ error: { message: 'Quota exceeded', errors: [{ reason: 'dailyLimitExceeded' }] } }, 403) })
    await assert.rejects(new GoogleBooksProvider('k').search({ q: 'otra', mode: 'title', page: 1 }), (e: unknown) => {
      assert.ok(e instanceof ProviderError)
      assert.equal(e.code, 'rate_limited')
      return true
    })
  })
})

describe('Portadas', () => {
  it('solo descarga de proveedores permitidos y por HTTPS', () => {
    assert.equal(isAllowedCoverUrl('https://covers.openlibrary.org/b/id/1-L.jpg'), true)
    assert.equal(isAllowedCoverUrl('https://ia800505.us.archive.org/x.jpg'), true)
    assert.equal(isAllowedCoverUrl('http://covers.openlibrary.org/b/id/1-L.jpg'), false)
    assert.equal(isAllowedCoverUrl('https://169.254.169.254/latest/meta-data'), false)
    assert.equal(isAllowedCoverUrl('https://covers.openlibrary.org.evil.example/x.jpg'), false)
    assert.equal(isAllowedCoverUrl('notaurl'), false)
  })

  it('rechaza archivos que no son imágenes aunque digan serlo', async () => {
    const fakeJpeg = Buffer.from('<script>alert(1)</script> no soy una imagen')
    await assert.rejects(processCoverImage(fakeJpeg), (e: unknown) => isDomainError(e) && e.code === 'bad_type')
    await assert.rejects(processCoverImage(Buffer.alloc(0)), (e: unknown) => isDomainError(e) && e.code === 'empty_file')
  })

  it('rechaza imágenes diminutas y marca las lisas', async () => {
    const tiny = await sharp({ create: { width: 40, height: 60, channels: 3, background: '#16324F' } }).png().toBuffer()
    await assert.rejects(processCoverImage(tiny), (e: unknown) => isDomainError(e) && e.code === 'too_small')
    const flat = await sharp({ create: { width: 400, height: 600, channels: 3, background: '#E2C044' } }).png().toBuffer()
    const processed = await processCoverImage(flat)
    assert.equal(processed.isFlat, true)
    await assert.rejects(storeCover(flat, { rejectFlat: true }), (e: unknown) => isDomainError(e) && e.code === 'cover_flat')
  })

  it('recodifica a JPEG, limita el tamaño y guarda con nombre aleatorio', async () => {
    const width = 1600
    const height = 2400
    const pixels = Buffer.alloc(width * height * 3)
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37) % 251
    const big = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer()
    const { key, color } = await storeCover(big)
    assert.match(key, /^[a-f0-9-]{36}\.jpg$/)
    assert.match(color, /^#[0-9a-f]{6}$/)
    const stored = await getStorage().read(`covers/${key}`)
    assert.ok(stored)
    const meta = await sharp(stored).metadata()
    assert.equal(meta.format, 'jpeg')
    assert.ok((meta.width ?? 0) <= 800 && (meta.height ?? 0) <= 1200)
    assert.equal(meta.exif, undefined)
  })

  it('el almacenamiento rechaza rutas manipuladas', async () => {
    await assert.rejects(getStorage().read('covers/../../.env'))
    await assert.rejects(getStorage().put('../evil.jpg', Buffer.from('x')))
  })
})
