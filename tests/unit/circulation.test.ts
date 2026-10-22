import './setup'
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { LOAN_RULES } from '@/lib/rules'
import {
  createBook,
  deleteBook,
  findPossibleDuplicates,
  getBookById,
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
  getUserBookState,
  listUserReservations,
  rejectLoan,
  renewLoan,
  requestLoan,
  reserveBook,
  returnLoan,
  setCopyStatus,
} from '@/server/circulation'
import { run } from '@/server/db'
import { isDomainError } from '@/server/errors'
import { authenticate, registerUser, setUserRole, setUserStatus } from '@/server/users'

let staff: number
let admin: number
let ana: number
let beto: number
let carla: number

function expectDomain(fn: () => unknown, code?: string) {
  assert.throws(fn, (error: unknown) => {
    assert.ok(isDomainError(error), `se esperaba DomainError y llegó ${String(error)}`)
    if (code) assert.equal(error.code, code)
    return true
  })
}

function newBook(title: string, copies: number) {
  const { id } = createBook({ title, authors: ['Autora de Prueba'], categories: ['Novela'] }, staff)
  if (copies) addCopies(staff, id, copies, {})
  return id
}

before(async () => {
  admin = (await registerUser({ name: 'Admin Prueba', email: 'admin@test.example', password: 'clave-segura-123', role: 'admin', consents: { source: 'test' } })).id
  staff = (await registerUser({ name: 'Biblio Prueba', email: 'biblio@test.example', password: 'clave-segura-123', role: 'librarian', consents: { source: 'test' } })).id
  ana = (await registerUser({ name: 'Ana', email: 'ana@test.example', password: 'clave-segura-123', consents: { source: 'test' } })).id
  beto = (await registerUser({ name: 'Beto', email: 'beto@test.example', password: 'clave-segura-123', consents: { source: 'test' } })).id
  carla = (await registerUser({ name: 'Carla', email: 'carla@test.example', password: 'clave-segura-123', consents: { source: 'test' } })).id
})

describe('Ciclo de un préstamo', () => {
  it('solicitud → aprobación → entrega → renovación → devolución', () => {
    const bookId = newBook('Libro del ciclo', 1)
    const { loanId } = requestLoan(ana, bookId)
    assert.equal(getLoan(loanId)?.status, 'pending')
    // La solicitud pendiente cuenta con el único ejemplar: nadie más puede pedirlo.
    assert.equal(getBookById(bookId)?.availableCopies, 0)
    expectDomain(() => requestLoan(beto, bookId), 'no_copies')

    approveLoan(staff, loanId)
    const approved = getLoan(loanId)!
    assert.equal(approved.status, 'approved')
    assert.ok(approved.copyId)
    assert.equal(listCopies(bookId)[0]?.status, 'reserved')

    const { dueAt } = checkoutLoan(staff, loanId)
    assert.equal(getLoan(loanId)?.status, 'checked_out')
    assert.equal(listCopies(bookId)[0]?.status, 'on_loan')
    const days = (new Date(dueAt).getTime() - Date.now()) / 86_400_000
    assert.ok(days > LOAN_RULES.loanDays - 1 && days <= LOAN_RULES.loanDays + 1)

    const renewed = renewLoan({ id: ana, isStaff: false }, loanId)
    assert.ok(new Date(renewed.dueAt) > new Date(dueAt))
    expectDomain(() => renewLoan({ id: beto, isStaff: false }, loanId), 'forbidden')

    returnLoan(staff, loanId)
    assert.equal(getLoan(loanId)?.status, 'returned')
    assert.equal(listCopies(bookId)[0]?.status, 'available')
  })

  it('no permite pedir dos veces el mismo libro ni reservar si hay ejemplares libres', () => {
    const bookId = newBook('Libro con dos ejemplares', 2)
    requestLoan(ana, bookId)
    expectDomain(() => requestLoan(ana, bookId), 'duplicate')
    expectDomain(() => reserveBook(beto, bookId), 'copies_available')
  })

  it('el rechazo exige un motivo y libera el ejemplar apartado', () => {
    const bookId = newBook('Libro a rechazar', 1)
    const { loanId } = requestLoan(beto, bookId)
    approveLoan(staff, loanId)
    expectDomain(() => rejectLoan(staff, loanId, 'no'), 'reason_required')
    rejectLoan(staff, loanId, 'El ejemplar está en reparación.')
    assert.equal(getLoan(loanId)?.status, 'rejected')
    assert.equal(getLoan(loanId)?.rejectionReason, 'El ejemplar está en reparación.')
    assert.equal(listCopies(bookId)[0]?.status, 'available')
  })

  it('no se renueva más de lo permitido', () => {
    const bookId = newBook('Libro para renovar', 1)
    const { loanId } = requestLoan(carla, bookId)
    checkoutLoan(staff, loanId)
    for (let i = 0; i < LOAN_RULES.maxRenewals; i++) renewLoan({ id: carla, isStaff: false }, loanId)
    expectDomain(() => renewLoan({ id: carla, isStaff: false }, loanId), 'limit')
    returnLoan(staff, loanId)
  })
})

describe('Reservas y cola de espera', () => {
  it('la devolución aparta el ejemplar para la primera persona en espera', () => {
    const bookId = newBook('Libro muy pedido', 1)
    const first = requestLoan(ana, bookId)
    checkoutLoan(staff, first.loanId)

    const r1 = reserveBook(beto, bookId)
    const r2 = reserveBook(carla, bookId)
    assert.equal(r1.position, 1)
    assert.equal(r2.position, 2)
    // Con gente esperando no se puede renovar.
    expectDomain(() => renewLoan({ id: ana, isStaff: false }, first.loanId), 'reserved')

    returnLoan(staff, first.loanId)
    const state = getUserBookState(beto, bookId)
    assert.equal(state.loan?.status, 'approved', 'Beto recibe el ejemplar apartado')
    assert.equal(state.reservation, null)
    assert.equal(listCopies(bookId)[0]?.status, 'reserved')
    const carlaReservation = listUserReservations(carla).find((r) => r.bookId === bookId && r.status === 'waiting')
    assert.equal(carlaReservation?.position, 1, 'Carla pasa a ser la siguiente')

    // Beto no lo recoge a tiempo: el apartado caduca y pasa a Carla.
    run(`UPDATE loans SET pickup_deadline = ? WHERE id = ?`, [new Date(Date.now() - 60_000).toISOString(), state.loan!.id])
    assert.equal(expireStalePickups(), 1)
    assert.equal(getLoan(state.loan!.id)?.status, 'expired')
    assert.equal(getUserBookState(carla, bookId).loan?.status, 'approved')

    // Carla cancela: el ejemplar vuelve a la estantería.
    cancelLoan({ id: carla, isStaff: false }, getUserBookState(carla, bookId).loan!.id)
    assert.equal(listCopies(bookId)[0]?.status, 'available')
  })

  it('un ejemplar nuevo atiende directamente la cola', () => {
    const bookId = newBook('Libro sin ejemplares libres', 1)
    const { loanId } = requestLoan(ana, bookId)
    checkoutLoan(staff, loanId)
    reserveBook(carla, bookId)
    addCopies(staff, bookId, 1, {})
    assert.equal(getUserBookState(carla, bookId).loan?.status, 'approved')
    returnLoan(staff, loanId)
  })
})

describe('Reglas de elegibilidad', () => {
  it('un préstamo vencido bloquea nuevas solicitudes', () => {
    const late = newBook('Libro vencido', 1)
    const other = newBook('Otro libro', 1)
    const { loanId } = requestLoan(beto, late)
    checkoutLoan(staff, loanId)
    run(`UPDATE loans SET due_at = ? WHERE id = ?`, [new Date(Date.now() - 86_400_000).toISOString(), loanId])
    expectDomain(() => requestLoan(beto, other), 'not_eligible')
    expectDomain(() => renewLoan({ id: beto, isStaff: false }, loanId), 'overdue')
    returnLoan(staff, loanId)
    requestLoan(beto, other)
  })

  it(`no permite más de ${LOAN_RULES.maxActiveLoans} libros a la vez`, async () => {
    const dani = (await registerUser({ name: 'Dani', email: 'dani@test.example', password: 'clave-segura-123', consents: { source: 'test' } })).id
    for (let i = 0; i < LOAN_RULES.maxActiveLoans; i++) requestLoan(dani, newBook(`Límite ${i}`, 1))
    expectDomain(() => requestLoan(dani, newBook('Uno de más', 1)), 'not_eligible')
  })

  it('una cuenta suspendida no puede entrar ni pedir', async () => {
    const eva = (await registerUser({ name: 'Eva', email: 'eva@test.example', password: 'clave-segura-123', consents: { source: 'test' } })).id
    setUserStatus({ id: staff, role: 'librarian' }, eva, 'suspended')
    expectDomain(() => requestLoan(eva, newBook('Libro para Eva', 1)), 'not_eligible')
    await assert.rejects(authenticate('eva@test.example', 'clave-segura-123'), (e: unknown) => isDomainError(e))
  })
})

describe('Ejemplares y fichas', () => {
  it('no cambia a mano el estado de un ejemplar prestado', () => {
    const bookId = newBook('Libro con ejemplar prestado', 1)
    const { loanId } = requestLoan(carla, bookId)
    checkoutLoan(staff, loanId)
    const copy = listCopies(bookId)[0]!
    expectDomain(() => setCopyStatus(staff, copy.id, 'lost'), 'in_circulation')
    expectDomain(() => setCopyStatus(staff, copy.id, 'on_loan'), 'invalid_status')
    returnLoan(staff, loanId)
    setCopyStatus(staff, copy.id, 'maintenance')
    assert.equal(listCopies(bookId)[0]?.status, 'maintenance')
  })

  it('no archiva con préstamos en curso ni elimina con historial', () => {
    const bookId = newBook('Libro con historial', 1)
    const { loanId } = requestLoan(ana, bookId)
    expectDomain(() => setBookStatus(bookId, 'archived', staff), 'has_active_loans')
    checkoutLoan(staff, loanId)
    returnLoan(staff, loanId)
    expectDomain(() => deleteBook(bookId, staff), 'has_history')
    setBookStatus(bookId, 'archived', staff)
    assert.equal(getBookById(bookId)?.status, 'archived')
    const fresh = newBook('Libro sin historia', 0)
    deleteBook(fresh, staff)
    assert.equal(getBookById(fresh), null)
  })

  it('detecta duplicados por ISBN (en cualquiera de sus formas) y por título', () => {
    createBook({ title: 'Rayuela', authors: ['Julio Cortázar'], categories: [], isbn: '978-84-376-0457-2' }, staff)
    assert.equal(findPossibleDuplicates({ isbn: '8437604575' }).exact.length, 1)
    expectDomain(
      () => createBook({ title: 'Otra', authors: ['X'], categories: [], isbn: '9788437604572' }, staff),
      'duplicate_isbn',
    )
    const similar = findPossibleDuplicates({ title: 'Rayuela', authors: ['Julio Cortazar'] })
    assert.equal(similar.similar.length, 1)
    assert.equal(findPossibleDuplicates({ title: 'Rayuela', authors: ['Otra Persona'] }).similar.length, 0)
    expectDomain(() => createBook({ title: 'Mal ISBN', authors: ['X'], categories: [], isbn: '1234567890' }, staff), 'invalid_isbn')
  })
})

describe('Búsqueda en el catálogo', () => {
  it('admite texto con cualquier orden, ISBN y filtros sin errores de parámetros', () => {
    createBook({ title: 'El jardín de senderos', authors: ['Jorge Luis Borges'], categories: ['Cuento'], keywords: 'laberintos' }, staff)
    for (const sort of ['relevance', 'title', 'recent', 'popular'] as const) {
      const result = searchBooks({ q: 'jardin borges', sort })
      assert.equal(result.total, 1, `orden ${sort}`)
      assert.equal(result.items[0]?.title, 'El jardín de senderos')
    }
    assert.equal(searchBooks({ q: 'laberintos' }).total, 1, 'busca por palabras clave')
    assert.equal(searchBooks({ q: '978-84-376-0457-2' }).items[0]?.title, 'Rayuela', 'busca por ISBN con guiones')
    assert.equal(searchBooks({ q: '100% _raro_' }).total, 0, 'escapa los comodines de LIKE')
    assert.ok(searchBooks({ category: 'cuento', availability: 'available' }).total >= 0)
  })
})

describe('Roles', () => {
  it('no deja la biblioteca sin administración ni permite cambiarse el propio rol', () => {
    expectDomain(() => setUserRole(admin, admin, 'reader'), 'self')
    expectDomain(() => setUserStatus({ id: staff, role: 'librarian' }, admin, 'suspended'), 'forbidden')
    setUserRole(admin, staff, 'admin')
    setUserRole(staff, admin, 'reader')
    expectDomain(() => setUserRole(admin, staff, 'reader'))
    expectDomain(() => setUserRole(staff, staff, 'reader'), 'self')
  })
})
