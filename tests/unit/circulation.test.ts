import './setup'
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { FINE_RULES, LOAN_RULES } from '@/lib/rules'
import {
  createBook,
  deleteBook,
  findPossibleDuplicates,
  getBookById,
  getEditorialPick,
  getFeaturedBooks,
  listCopies,
  searchBooks,
  setBookStatus,
} from '@/server/catalog'
import {
  addCopies,
  approveLoan,
  cancelLoan,
  checkoutLoan,
  expireStalePickups,
  getLoan,
  getReaderEligibility,
  getUserBookState,
  getUserFineSummary,
  listUserFines,
  listUserReservations,
  rejectLoan,
  requestLoan,
  reserveBook,
  returnLoan,
  setCopyStatus,
  settleFine,
} from '@/server/circulation'
import { all, get, run, transaction } from '@/server/db'
import { isDomainError } from '@/server/errors'
import { authenticate, listLoanCards, registerUser, removeLoanCard, setUserRole, setUserStatus } from '@/server/users'

let staff: number
let admin: number
let ana: number
let beto: number
let carla: number

const DAY = 86_400_000
/** Tarjeta Visa de pruebas: pasa Luhn. */
const TEST_CARD = '4242 4242 4242 4242'
let documentSeq = 1_000_000

function identity() {
  return { phone: '300 123 4567', documentType: 'CC', documentNumber: String(documentSeq++), creditCard: TEST_CARD }
}

async function reader(name: string) {
  const email = `${name.toLowerCase()}@test.example`
  return (await registerUser({ name, email, password: 'clave-segura-123', consents: { source: 'test' }, identity: identity() })).id
}

async function expectDomain(fn: () => Promise<unknown>, code?: string) {
  await assert.rejects(fn, (error: unknown) => {
    assert.ok(isDomainError(error), `se esperaba DomainError y llegó ${String(error)}`)
    if (code) assert.equal(error.code, code)
    return true
  })
}

async function newBook(title: string, copies: number) {
  const { id } = await createBook({ title, authors: ['Autora de Prueba'], categories: ['Novela'] }, staff)
  if (copies) await addCopies(staff, id, copies, {})
  return id
}

/**
 * Simula el paso del tiempo moviendo la fecha de devolución al pasado. El plazo está
 * bloqueado por un trigger; solo una corrección explícita (SET LOCAL) lo permite.
 */
async function moveDueDate(loanId: number, daysFromNow: number) {
  await transaction(async () => {
    await run(`SELECT set_config('gotagota.term_override', 'on', true)`)
    await run('UPDATE loans SET due_at = ? WHERE id = ?', [new Date(Date.now() + daysFromNow * DAY).toISOString(), loanId])
  })
}

before(async () => {
  admin = (await registerUser({ name: 'Admin Prueba', email: 'admin@test.example', password: 'clave-segura-123', role: 'admin', consents: { source: 'test' } })).id
  staff = (await registerUser({ name: 'Biblio Prueba', email: 'biblio@test.example', password: 'clave-segura-123', role: 'librarian', consents: { source: 'test' } })).id
  ana = await reader('Ana')
  beto = await reader('Beto')
  carla = await reader('Carla')
})

describe('Indicadores booleanos del catálogo', () => {
  it('consulta y guarda libros destacados y selección editorial con tipos booleanos', async () => {
    const { id } = await createBook({
      title: 'Selección editorial de prueba',
      authors: ['Autora de Prueba'],
      categories: [],
      featured: true,
      editorialPick: true,
    }, staff)

    assert.equal((await getEditorialPick())?.id, id)
    assert.ok((await getFeaturedBooks()).some((book) => book.id === id))
  })
})

describe('Ciclo de un préstamo', () => {
  it('solicitud con plazo elegido → aprobación → entrega → devolución a tiempo, sin multa', async () => {
    const bookId = await newBook('Libro del ciclo', 1)
    const { loanId, loanDays } = await requestLoan(ana, bookId, { loanDays: 7 })
    assert.equal(loanDays, 7)
    assert.equal((await getLoan(loanId))?.status, 'pending')
    assert.equal((await getLoan(loanId))?.loanDays, 7)
    // La solicitud pendiente cuenta con el único ejemplar: nadie más puede pedirlo.
    assert.equal((await getBookById(bookId))?.availableCopies, 0)
    await expectDomain(async () => requestLoan(beto, bookId), 'no_copies')

    await approveLoan(staff, loanId)
    const approved = (await getLoan(loanId))!
    assert.equal(approved.status, 'approved')
    assert.ok(approved.copyId)
    assert.equal((await listCopies(bookId))[0]?.status, 'reserved')

    const { dueAt } = await checkoutLoan(staff, loanId)
    assert.equal((await getLoan(loanId))?.status, 'checked_out')
    assert.equal((await listCopies(bookId))[0]?.status, 'on_loan')
    const days = (new Date(dueAt).getTime() - Date.now()) / DAY
    assert.ok(days > 6 && days <= 8, `el plazo elegido (7 días) fija la devolución; salieron ${days}`)

    const { fine } = await returnLoan(staff, loanId)
    assert.equal(fine, null)
    assert.equal((await getLoan(loanId))?.status, 'returned')
    assert.equal((await listCopies(bookId))[0]?.status, 'available')
    assert.equal((await listUserFines(ana)).length, 0)
  })

  it('sin plazo indicado usa el plazo por defecto; un plazo fuera de la lista se rechaza', async () => {
    const bookId = await newBook('Libro con plazo por defecto', 2)
    const { loanDays } = await requestLoan(beto, bookId)
    assert.equal(loanDays, LOAN_RULES.defaultLoanDays)
    await expectDomain(async () => requestLoan(carla, bookId, { loanDays: 30 }), 'invalid_period')
  })

  it('no permite pedir dos veces el mismo libro ni reservar si hay ejemplares libres', async () => {
    const bookId = await newBook('Libro con dos ejemplares', 2)
    await requestLoan(ana, bookId)
    await expectDomain(async () => requestLoan(ana, bookId), 'duplicate')
    await expectDomain(async () => reserveBook(beto, bookId), 'copies_available')
  })

  it('el rechazo exige un motivo y libera el ejemplar apartado', async () => {
    const bookId = await newBook('Libro a rechazar', 1)
    const { loanId } = await requestLoan(beto, bookId)
    await approveLoan(staff, loanId)
    await expectDomain(async () => rejectLoan(staff, loanId, 'no'), 'reason_required')
    await rejectLoan(staff, loanId, 'El ejemplar está en reparación.')
    assert.equal((await getLoan(loanId))?.status, 'rejected')
    assert.equal((await getLoan(loanId))?.rejectionReason, 'El ejemplar está en reparación.')
    assert.equal((await listCopies(bookId))[0]?.status, 'available')
  })
})

describe('Plazo de lectura fijo', () => {
  it('la base de datos impide cambiar el plazo, la fecha de devolución o renovar', async () => {
    const bookId = await newBook('Libro de plazo fijo', 1)
    const { loanId } = await requestLoan(carla, bookId, { loanDays: 14 })
    await assert.rejects(() => run('UPDATE loans SET loan_days = 21 WHERE id = ?', [loanId]), /plazo de lectura/)
    await checkoutLoan(staff, loanId)
    await assert.rejects(
      () => run('UPDATE loans SET due_at = ? WHERE id = ?', [new Date(Date.now() + 60 * DAY).toISOString(), loanId]),
      /fecha de devolución/,
    )
    await assert.rejects(() => run('UPDATE loans SET renewals = renewals + 1 WHERE id = ?', [loanId]), /no se renuevan/)
    assert.equal((await getLoan(loanId))?.loanDays, 14)
    // El resto del préstamo sí evoluciona con normalidad.
    await returnLoan(staff, loanId)
    assert.equal((await getLoan(loanId))?.status, 'returned')
  })
})

describe('Carnés de préstamo', () => {
  it('pide con el carné principal por defecto, con uno guardado o con un número nuevo que se registra', async () => {
    const [primary] = await listLoanCards(ana)
    assert.ok(primary?.isPrimary)
    const b1 = await newBook('Libro carné principal', 1)
    assert.equal((await requestLoan(ana, b1)).cardNumber, primary.number)

    const b2 = await newBook('Libro carné nuevo', 1)
    const typed = await requestLoan(ana, b2, { cardNumber: ' uni-2026-0001 ' })
    assert.equal(typed.cardNumber, 'UNI-2026-0001', 'normaliza mayúsculas y espacios')
    const cards = await listLoanCards(ana)
    assert.equal(cards.length, 2)
    const extra = cards.find((c) => !c.isPrimary)!

    const b3 = await newBook('Libro carné elegido', 1)
    assert.equal((await requestLoan(ana, b3, { cardId: extra.id })).cardNumber, 'UNI-2026-0001')
    assert.equal((await getLoan((await getUserBookState(ana, b3)).loan!.id))?.loanCardNumber, 'UNI-2026-0001')
  })

  it('no deja usar el carné de otra persona ni eliminar el principal o uno en uso', async () => {
    const bookId = await newBook('Libro carné ajeno', 1)
    const [anaPrimary] = await listLoanCards(ana)
    await expectDomain(async () => requestLoan(beto, bookId, { cardNumber: anaPrimary!.number }), 'card_taken')
    await expectDomain(async () => requestLoan(beto, bookId, { cardId: anaPrimary!.id }), 'invalid_card')
    await expectDomain(async () => requestLoan(beto, bookId, { cardNumber: 'x' }), 'invalid_card')
    await expectDomain(async () => removeLoanCard(ana, anaPrimary!.id), 'primary')
    const extra = (await listLoanCards(ana)).find((c) => !c.isPrimary)!
    await expectDomain(async () => removeLoanCard(ana, extra.id), 'in_use')
    // El fallo no dejó un carné a medio registrar.
    assert.equal((await listLoanCards(beto)).length, 1)
  })
})

describe('Atrasos y multas', () => {
  it(`cobra ${FINE_RULES.dailyFine} COP por día de retraso al devolver, y bloquea nuevos préstamos hasta pagar`, async () => {
    const dani = await reader('Dani')
    const late = await newBook('Libro devuelto tarde', 1)
    const other = await newBook('Otro libro tras la multa', 1)
    const { loanId } = await requestLoan(dani, late, { loanDays: 7 })
    await checkoutLoan(staff, loanId)
    await moveDueDate(loanId, -3)

    // Vencido y sin devolver: la multa se acumula en vivo y bloquea.
    const live = await getUserFineSummary(dani)
    assert.equal(live.overdueLoans, 1)
    assert.ok(live.accruing >= 3 * FINE_RULES.dailyFine && live.accruing <= 4 * FINE_RULES.dailyFine)
    await expectDomain(async () => requestLoan(dani, other), 'not_eligible')

    const { fine } = await returnLoan(staff, loanId)
    assert.ok(fine && fine.days >= 3 && fine.days <= 4, `días de retraso: ${fine?.days}`)
    assert.equal(fine.amount, fine.days * FINE_RULES.dailyFine)
    const [stored] = await listUserFines(dani)
    assert.equal(stored?.status, 'pending')
    assert.equal(stored?.amount, fine.amount)

    // Devuelto pero con multa pendiente: sigue bloqueado.
    const blocked = await getReaderEligibility(dani)
    assert.equal(blocked.canRequest, false)
    assert.match(blocked.reason!, /multas pendientes/)
    await expectDomain(async () => reserveBook(dani, other), 'not_eligible')

    await expectDomain(async () => settleFine(staff, stored!.id, 'waived', 'no'), 'reason_required')
    await settleFine(staff, stored!.id, 'paid', 'Recibo 001')
    await expectDomain(async () => settleFine(staff, stored!.id, 'paid'), 'invalid_state')
    assert.equal((await getReaderEligibility(dani)).canRequest, true)
    await requestLoan(dani, other)
  })

  it('la base de datos garantiza la fórmula y no deja reescribir ni borrar una multa', async () => {
    await assert.rejects(
      () => run(`INSERT INTO fines (loan_id, user_id, days_late, daily_rate, amount) SELECT id, user_id, 2, 5000, 9999 FROM loans LIMIT 1`),
      /fines_formula/,
    )
    const fine = (await all<{ id: number }>('SELECT id FROM fines LIMIT 1'))[0]!
    await assert.rejects(() => run('UPDATE fines SET amount = 0, days_late = 0 WHERE id = ?', [fine.id]))
    await assert.rejects(() => run('DELETE FROM fines WHERE id = ?', [fine.id]), /no se borran/)
  })

  it('una devolución el día siguiente al vencimiento cuenta 1 día', async () => {
    const eli = await reader('Eli')
    const bookId = await newBook('Libro un día tarde', 1)
    const { loanId } = await requestLoan(eli, bookId, { loanDays: 7 })
    await checkoutLoan(staff, loanId)
    // Vence al final de ayer (hora de Bogotá): hoy es el primer día de retraso.
    const yesterdayEnd = await get<{ due: string }>(
      `SELECT (date_trunc('day', now() AT TIME ZONE 'America/Bogota') - interval '1 millisecond') AT TIME ZONE 'America/Bogota' AS due`,
    )
    await transaction(async () => {
      await run(`SELECT set_config('gotagota.term_override', 'on', true)`)
      await run('UPDATE loans SET due_at = ? WHERE id = ?', [yesterdayEnd!.due, loanId])
    })
    const { fine } = await returnLoan(staff, loanId)
    assert.deepEqual(fine, { days: 1, amount: FINE_RULES.dailyFine })
  })
})

describe('Reservas y cola de espera', () => {
  it('la devolución aparta el ejemplar para la primera persona en espera, con su plazo y su carné', async () => {
    const bookId = await newBook('Libro muy pedido', 1)
    const first = await requestLoan(ana, bookId)
    await checkoutLoan(staff, first.loanId)

    const r1 = await reserveBook(beto, bookId, { loanDays: 21, cardNumber: 'BETO-EXTRA-1' })
    const r2 = await reserveBook(carla, bookId, { loanDays: 7 })
    assert.equal(r1.position, 1)
    assert.equal(r2.position, 2)

    await returnLoan(staff, first.loanId)
    const state = await getUserBookState(beto, bookId)
    assert.equal(state.loan?.status, 'approved', 'Beto recibe el ejemplar apartado')
    assert.equal(state.loan?.loanDays, 21, 'con el plazo que eligió al reservar')
    assert.equal(state.loan?.loanCardNumber, 'BETO-EXTRA-1', 'y con el carné que eligió')
    assert.equal(state.reservation, null)
    assert.equal((await listCopies(bookId))[0]?.status, 'reserved')
    const carlaReservation = (await listUserReservations(carla)).find((r) => r.bookId === bookId && r.status === 'waiting')
    assert.equal(carlaReservation?.position, 1, 'Carla pasa a ser la siguiente')

    // Beto no lo recoge a tiempo: el apartado caduca y pasa a Carla.
    await run(`UPDATE loans SET pickup_deadline = ? WHERE id = ?`, [new Date(Date.now() - 60_000).toISOString(), state.loan!.id])
    assert.equal(await expireStalePickups(), 1)
    assert.equal((await getLoan(state.loan!.id))?.status, 'expired')
    const carlaLoan = (await getUserBookState(carla, bookId)).loan
    assert.equal(carlaLoan?.status, 'approved')
    assert.equal(carlaLoan?.loanDays, 7)

    // Carla cancela: el ejemplar vuelve a la estantería.
    await cancelLoan({ id: carla, isStaff: false }, carlaLoan!.id)
    assert.equal((await listCopies(bookId))[0]?.status, 'available')
  })

  it('un ejemplar nuevo atiende directamente la cola', async () => {
    const bookId = await newBook('Libro sin ejemplares libres', 1)
    const { loanId } = await requestLoan(ana, bookId)
    await checkoutLoan(staff, loanId)
    await reserveBook(carla, bookId)
    await addCopies(staff, bookId, 1, {})
    assert.equal((await getUserBookState(carla, bookId)).loan?.status, 'approved')
    await returnLoan(staff, loanId)
  })
})

describe('Reglas de elegibilidad', () => {
  it('sin teléfono, documento y tarjeta no se puede pedir ni reservar', async () => {
    const fede = (await registerUser({ name: 'Fede', email: 'fede@test.example', password: 'clave-segura-123', consents: { source: 'test' } })).id
    const eligibility = await getReaderEligibility(fede)
    assert.equal(eligibility.canRequest, false)
    assert.equal(eligibility.missingIdentity, true)
    await expectDomain(async () => requestLoan(fede, await newBook('Libro para Fede', 1)), 'not_eligible')
  })

  it('un préstamo vencido bloquea nuevas solicitudes', async () => {
    const late = await newBook('Libro vencido', 1)
    const other = await newBook('Otro libro', 1)
    const gael = await reader('Gael')
    const { loanId } = await requestLoan(gael, late)
    await checkoutLoan(staff, loanId)
    await moveDueDate(loanId, -1)
    await expectDomain(async () => requestLoan(gael, other), 'not_eligible')
  })

  it(`no permite más de ${LOAN_RULES.maxActiveLoans} libros a la vez`, async () => {
    const hugo = await reader('Hugo')
    for (let i = 0; i < LOAN_RULES.maxActiveLoans; i++) await requestLoan(hugo, await newBook(`Límite ${i}`, 1))
    await expectDomain(async () => requestLoan(hugo, await newBook('Uno de más', 1)), 'not_eligible')
  })

  it('una cuenta suspendida no puede entrar ni pedir', async () => {
    const eva = await reader('Eva')
    await setUserStatus({ id: staff, role: 'librarian' }, eva, 'suspended')
    await expectDomain(async () => requestLoan(eva, await newBook('Libro para Eva', 1)), 'not_eligible')
    await assert.rejects(authenticate('eva@test.example', 'clave-segura-123'), (e: unknown) => isDomainError(e))
  })
})

describe('Ejemplares y fichas', () => {
  it('no cambia a mano el estado de un ejemplar prestado', async () => {
    const bookId = await newBook('Libro con ejemplar prestado', 1)
    const { loanId } = await requestLoan(carla, bookId)
    await checkoutLoan(staff, loanId)
    const copy = (await listCopies(bookId))[0]!
    await expectDomain(async () => setCopyStatus(staff, copy.id, 'lost'), 'in_circulation')
    await expectDomain(async () => setCopyStatus(staff, copy.id, 'on_loan'), 'invalid_status')
    await returnLoan(staff, loanId)
    await setCopyStatus(staff, copy.id, 'maintenance')
    assert.equal((await listCopies(bookId))[0]?.status, 'maintenance')
  })

  it('no archiva con préstamos en curso ni elimina con historial', async () => {
    const bookId = await newBook('Libro con historial', 1)
    const { loanId } = await requestLoan(beto, bookId)
    await expectDomain(async () => setBookStatus(bookId, 'archived', staff), 'has_active_loans')
    await checkoutLoan(staff, loanId)
    await returnLoan(staff, loanId)
    await expectDomain(async () => deleteBook(bookId, staff), 'has_history')
    await setBookStatus(bookId, 'archived', staff)
    assert.equal((await getBookById(bookId))?.status, 'archived')
    const fresh = await newBook('Libro sin historia', 0)
    await deleteBook(fresh, staff)
    assert.equal(await getBookById(fresh), null)
  })

  it('detecta duplicados por ISBN (en cualquiera de sus formas) y por título', async () => {
    await createBook({ title: 'Rayuela', authors: ['Julio Cortázar'], categories: [], isbn: '978-84-376-0457-2' }, staff)
    assert.equal((await findPossibleDuplicates({ isbn: '8437604575' })).exact.length, 1)
    await expectDomain(
      async () => createBook({ title: 'Otra', authors: ['X'], categories: [], isbn: '9788437604572' }, staff),
      'duplicate_isbn',
    )
    const similar = await findPossibleDuplicates({ title: 'Rayuela', authors: ['Julio Cortazar'] })
    assert.equal(similar.similar.length, 1)
    assert.equal((await findPossibleDuplicates({ title: 'Rayuela', authors: ['Otra Persona'] })).similar.length, 0)
    await expectDomain(async () => createBook({ title: 'Mal ISBN', authors: ['X'], categories: [], isbn: '1234567890' }, staff), 'invalid_isbn')
  })
})

describe('Búsqueda en el catálogo', () => {
  it('admite texto con cualquier orden, ISBN y filtros sin errores de parámetros', async () => {
    await createBook({ title: 'El jardín de senderos', authors: ['Jorge Luis Borges'], categories: ['Cuento'], keywords: 'laberintos' }, staff)
    for (const sort of ['relevance', 'title', 'recent', 'popular'] as const) {
      const result = await searchBooks({ q: 'jardin borges', sort })
      assert.equal(result.total, 1, `orden ${sort}`)
      assert.equal(result.items[0]?.title, 'El jardín de senderos')
    }
    assert.equal((await searchBooks({ q: 'laberintos' })).total, 1, 'busca por palabras clave')
    assert.equal((await searchBooks({ q: '978-84-376-0457-2' })).items[0]?.title, 'Rayuela', 'busca por ISBN con guiones')
    assert.equal((await searchBooks({ q: '100% _raro_' })).total, 0, 'escapa los comodines de LIKE')
    assert.ok((await searchBooks({ category: 'cuento', availability: 'available' })).total >= 0)
  })
})

describe('Roles', () => {
  it('no deja la biblioteca sin administración ni permite cambiarse el propio rol', async () => {
    await expectDomain(async () => setUserRole(admin, admin, 'reader'), 'self')
    await expectDomain(async () => setUserStatus({ id: staff, role: 'librarian' }, admin, 'suspended'), 'forbidden')
    await setUserRole(admin, staff, 'admin')
    await setUserRole(staff, admin, 'reader')
    await expectDomain(async () => setUserRole(admin, staff, 'reader'))
    await expectDomain(async () => setUserRole(staff, staff, 'reader'), 'self')
  })
})
