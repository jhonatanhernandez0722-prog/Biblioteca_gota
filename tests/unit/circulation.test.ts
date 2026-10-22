import './setup'
import assert from 'node:assert/strict'
import { before, describe, it } from 'node:test'
import { LOAN_RULES } from '@/lib/rules'
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

before(async () => {
  admin = (await registerUser({ name: 'Admin Prueba', email: 'admin@test.example', password: 'clave-segura-123', role: 'admin', consents: { source: 'test' } })).id
  staff = (await registerUser({ name: 'Biblio Prueba', email: 'biblio@test.example', password: 'clave-segura-123', role: 'librarian', consents: { source: 'test' } })).id
  ana = (await registerUser({ name: 'Ana', email: 'ana@test.example', password: 'clave-segura-123', consents: { source: 'test' } })).id
  beto = (await registerUser({ name: 'Beto', email: 'beto@test.example', password: 'clave-segura-123', consents: { source: 'test' } })).id
  carla = (await registerUser({ name: 'Carla', email: 'carla@test.example', password: 'clave-segura-123', consents: { source: 'test' } })).id
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
  it('solicitud → aprobación → entrega → renovación → devolución', async () => {
    const bookId = await newBook('Libro del ciclo', 1)
    const { loanId } = await requestLoan(ana, bookId)
    assert.equal((await getLoan(loanId))?.status, 'pending')
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
    const days = (new Date(dueAt).getTime() - Date.now()) / 86_400_000
    assert.ok(days > LOAN_RULES.loanDays - 1 && days <= LOAN_RULES.loanDays + 1)

    const renewed = await renewLoan({ id: ana, isStaff: false }, loanId)
    assert.ok(new Date(renewed.dueAt) > new Date(dueAt))
    await expectDomain(async () => renewLoan({ id: beto, isStaff: false }, loanId), 'forbidden')

    await returnLoan(staff, loanId)
    assert.equal((await getLoan(loanId))?.status, 'returned')
    assert.equal((await listCopies(bookId))[0]?.status, 'available')
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

  it('no se renueva más de lo permitido', async () => {
    const bookId = await newBook('Libro para renovar', 1)
    const { loanId } = await requestLoan(carla, bookId)
    await checkoutLoan(staff, loanId)
    for (let i = 0; i < LOAN_RULES.maxRenewals; i++) await renewLoan({ id: carla, isStaff: false }, loanId)
    await expectDomain(async () => renewLoan({ id: carla, isStaff: false }, loanId), 'limit')
    await returnLoan(staff, loanId)
  })
})

describe('Reservas y cola de espera', () => {
  it('la devolución aparta el ejemplar para la primera persona en espera', async () => {
    const bookId = await newBook('Libro muy pedido', 1)
    const first = await requestLoan(ana, bookId)
    await checkoutLoan(staff, first.loanId)

    const r1 = await reserveBook(beto, bookId)
    const r2 = await reserveBook(carla, bookId)
    assert.equal(r1.position, 1)
    assert.equal(r2.position, 2)
    // Con gente esperando no se puede renovar.
    await expectDomain(async () => renewLoan({ id: ana, isStaff: false }, first.loanId), 'reserved')

    await returnLoan(staff, first.loanId)
    const state = await getUserBookState(beto, bookId)
    assert.equal(state.loan?.status, 'approved', 'Beto recibe el ejemplar apartado')
    assert.equal(state.reservation, null)
    assert.equal((await listCopies(bookId))[0]?.status, 'reserved')
    const carlaReservation = (await listUserReservations(carla)).find((r) => r.bookId === bookId && r.status === 'waiting')
    assert.equal(carlaReservation?.position, 1, 'Carla pasa a ser la siguiente')

    // Beto no lo recoge a tiempo: el apartado caduca y pasa a Carla.
    await run(`UPDATE loans SET pickup_deadline = ? WHERE id = ?`, [new Date(Date.now() - 60_000).toISOString(), state.loan!.id])
    assert.equal(await expireStalePickups(), 1)
    assert.equal((await getLoan(state.loan!.id))?.status, 'expired')
    assert.equal((await getUserBookState(carla, bookId)).loan?.status, 'approved')

    // Carla cancela: el ejemplar vuelve a la estantería.
    await cancelLoan({ id: carla, isStaff: false }, (await getUserBookState(carla, bookId)).loan!.id)
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
  it('un préstamo vencido bloquea nuevas solicitudes', async () => {
    const late = await newBook('Libro vencido', 1)
    const other = await newBook('Otro libro', 1)
    const { loanId } = await requestLoan(beto, late)
    await checkoutLoan(staff, loanId)
    await run(`UPDATE loans SET due_at = ? WHERE id = ?`, [new Date(Date.now() - 86_400_000).toISOString(), loanId])
    await expectDomain(async () => requestLoan(beto, other), 'not_eligible')
    await expectDomain(async () => renewLoan({ id: beto, isStaff: false }, loanId), 'overdue')
    await returnLoan(staff, loanId)
    await requestLoan(beto, other)
  })

  it(`no permite más de ${LOAN_RULES.maxActiveLoans} libros a la vez`, async () => {
    const dani = (await registerUser({ name: 'Dani', email: 'dani@test.example', password: 'clave-segura-123', consents: { source: 'test' } })).id
    for (let i = 0; i < LOAN_RULES.maxActiveLoans; i++) await requestLoan(dani, await newBook(`Límite ${i}`, 1))
    await expectDomain(async () => requestLoan(dani, await newBook('Uno de más', 1)), 'not_eligible')
  })

  it('una cuenta suspendida no puede entrar ni pedir', async () => {
    const eva = (await registerUser({ name: 'Eva', email: 'eva@test.example', password: 'clave-segura-123', consents: { source: 'test' } })).id
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
    const { loanId } = await requestLoan(ana, bookId)
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
