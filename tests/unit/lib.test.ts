import './setup'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { calendarDaysFrom, describeDue, endOfLibraryDay } from '@/lib/dates'
import { isbn10To13, isbn13To10, isValidIsbn10, isValidIsbn13, looksLikeIsbn, normalizeIsbn } from '@/lib/isbn'
import { joinAuthors, normalizeText, similarity, slugify } from '@/lib/text'
import { sortTitle } from '@/server/catalog'

describe('ISBN', () => {
  it('valida ISBN-13 e ISBN-10 con su dígito de control', () => {
    assert.equal(isValidIsbn13('9788437604572'), true)
    assert.equal(isValidIsbn13('9788437604573'), false)
    assert.equal(isValidIsbn10('8437604575'), true)
    assert.equal(isValidIsbn10('843760457X'), false)
    assert.equal(isValidIsbn10('080442957X'), true)
  })

  it('convierte entre ISBN-10 e ISBN-13', () => {
    assert.equal(isbn10To13('8437604575'), '9788437604572')
    assert.equal(isbn13To10('9788437604572'), '8437604575')
    assert.equal(isbn13To10('9798000000000'), null)
  })

  it('normaliza ignorando guiones y espacios', () => {
    assert.deepEqual(normalizeIsbn('978-84-376-0457-2'), { isbn13: '9788437604572', isbn10: '8437604575' })
    assert.deepEqual(normalizeIsbn(' 84 376 0457 5 '), { isbn13: '9788437604572', isbn10: '8437604575' })
    assert.equal(normalizeIsbn('1234567890123'), null)
    assert.equal(normalizeIsbn(''), null)
    assert.equal(looksLikeIsbn('978-84-376-0457-2'), true)
    assert.equal(looksLikeIsbn('Rayuela'), false)
  })
})

describe('Texto', () => {
  it('normaliza tildes y mayúsculas para buscar', () => {
    assert.equal(normalizeText('  Cien AÑOS de   Soledad '), 'cien anos de soledad')
  })

  it('crea slugs legibles', () => {
    assert.equal(slugify('¿Quién se ha llevado mi queso?'), 'quien-se-ha-llevado-mi-queso')
    assert.equal(slugify('!!!'), 'libro')
  })

  it('ordena títulos ignorando el artículo inicial', () => {
    assert.equal(sortTitle('El amor en los tiempos del cólera'), 'amor en los tiempos del colera')
    assert.equal(sortTitle('La vorágine'), 'voragine')
    assert.equal(sortTitle('1984'), '1984')
  })

  it('mide la similitud de títulos', () => {
    assert.equal(similarity('Rayuela', 'rayuela'), 1)
    assert.ok(similarity('Cien años de soledad', 'Cien anos de soledad') > 0.9)
    assert.ok(similarity('Rayuela', 'Ficciones') < 0.3)
  })

  it('une autores en lenguaje natural', () => {
    assert.equal(joinAuthors(['A']), 'A')
    assert.equal(joinAuthors(['A', 'B']), 'A y B')
    assert.equal(joinAuthors(['A', 'B', 'C']), 'A, B y C')
    assert.equal(joinAuthors([]), 'Autoría desconocida')
  })
})

describe('Fechas de la biblioteca (America/Bogota, UTC−5)', () => {
  it('el plazo vence al final del día local', () => {
    // 21 de octubre de 2026, 10:00 en Bogotá = 15:00 UTC
    const end = endOfLibraryDay(new Date('2026-10-21T15:00:00Z'))
    assert.equal(end.toISOString(), '2026-10-22T04:59:59.999Z')
  })

  it('un instante de madrugada UTC sigue perteneciendo al día anterior en Bogotá', () => {
    const end = endOfLibraryDay(new Date('2026-10-22T03:00:00Z'))
    assert.equal(end.toISOString(), '2026-10-22T04:59:59.999Z')
  })

  it('describe vencimientos en días naturales', () => {
    const now = new Date('2026-10-21T15:00:00Z')
    assert.equal(calendarDaysFrom('2026-10-22T04:59:59.999Z', now), 0)
    assert.equal(describeDue('2026-10-22T04:59:59.999Z', now), 'vence hoy')
    assert.equal(describeDue('2026-10-26T15:00:00Z', now), 'vence en 5 días')
    assert.equal(describeDue('2026-10-19T15:00:00Z', now), 'venció hace 2 días')
  })
})
