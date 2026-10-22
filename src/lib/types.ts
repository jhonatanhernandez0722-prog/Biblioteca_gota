/** Tipos de dominio compartidos entre servidor y componentes. */

export type Role = 'reader' | 'librarian' | 'admin'
export type UserStatus = 'active' | 'suspended'
export type BookStatus = 'active' | 'archived'
export type CopyStatus = 'available' | 'reserved' | 'on_loan' | 'maintenance' | 'lost' | 'withdrawn'
export type CopyCondition = 'new' | 'good' | 'worn' | 'damaged'
export type LoanStatus =
  | 'pending'
  | 'approved'
  | 'checked_out'
  | 'returned'
  | 'rejected'
  | 'cancelled'
  | 'expired'
export type ReservationStatus = 'waiting' | 'fulfilled' | 'cancelled'
export type FineStatus = 'pending' | 'paid' | 'waived'

export interface SessionUser {
  id: number
  name: string
  email: string
  role: Role
  status: UserStatus
  cardNumber: string
}

export interface Category {
  id: number
  slug: string
  name: string
  description: string | null
}

export interface CategoryWithCount extends Category {
  bookCount: number
}

/** Lo mínimo para pintar un libro en una tarjeta o un carril. */
export interface BookSummary {
  id: number
  slug: string
  title: string
  subtitle: string | null
  authors: string[]
  categories: { slug: string; name: string }[]
  publishedYear: number | null
  coverKey: string | null
  coverColor: string | null
  availableCopies: number
  totalCopies: number
  createdAt: string
  status: BookStatus
}

export interface BookDetail extends BookSummary {
  description: string | null
  publisher: string | null
  isbn13: string | null
  isbn10: string | null
  language: string | null
  pageCount: number | null
  callNumber: string | null
  keywords: string | null
  sourceProvider: string
  sourceRef: string | null
  sourceUrl: string | null
  featured: boolean
  editorialPick: boolean
  editorialNote: string | null
  editorialQuote: string | null
  waitingReservations: number
  isDemo: boolean
  updatedAt: string
}

export interface Copy {
  id: number
  bookId: number
  code: string
  location: string | null
  condition: CopyCondition
  status: CopyStatus
  notes: string | null
  acquiredAt: string | null
  createdAt: string
}

export interface LoanRecord {
  id: number
  status: LoanStatus
  userId: number
  userName: string
  userEmail: string
  userCardNumber: string
  bookId: number
  bookSlug: string
  bookTitle: string
  bookAuthors: string[]
  coverKey: string | null
  coverColor: string | null
  copyId: number | null
  copyCode: string | null
  requestedAt: string
  decidedAt: string | null
  pickupDeadline: string | null
  checkedOutAt: string | null
  dueAt: string | null
  returnedAt: string | null
  renewals: number
  rejectionReason: string | null
  /** Plazo de lectura elegido al pedirlo (días desde la entrega). Fijo una vez confirmado. */
  loanDays: number
  /** Carné con el que se pidió (copia del número, se conserva aunque el carné se elimine). */
  loanCardNumber: string | null
}

/** Carné de préstamo registrado en una cuenta. El principal es el que emite la biblioteca. */
export interface LoanCard {
  id: number
  number: string
  label: string
  isPrimary: boolean
  createdAt: string
}

/** Datos de identificación del lector. Nunca contiene el número completo de la tarjeta. */
export interface ReaderIdentity {
  phone: string | null
  documentType: 'CC' | 'TI' | null
  documentNumber: string | null
  cardBrand: string | null
  cardLast4: string | null
  /** true cuando están todos los datos que exige pedir préstamos. */
  complete: boolean
}

export interface FineRecord {
  id: number
  loanId: number
  userId: number
  userName: string
  userCardNumber: string
  bookTitle: string
  bookSlug: string
  dueAt: string
  returnedAt: string
  daysLate: number
  dailyRate: number
  amount: number
  status: FineStatus
  createdAt: string
  settledAt: string | null
  settleNote: string | null
}

export interface ReservationRecord {
  id: number
  status: ReservationStatus
  userId: number
  userName: string
  userEmail: string
  bookId: number
  bookSlug: string
  bookTitle: string
  bookAuthors: string[]
  coverKey: string | null
  coverColor: string | null
  createdAt: string
  /** Puesto en la cola (1 = siguiente). Solo para reservas en espera. */
  position: number | null
  loanDays: number
}

/** Resultado estándar de una server action con formulario. */
export interface ActionState {
  ok: boolean
  message?: string
  fieldErrors?: Record<string, string>
  /** Valores enviados (nunca contraseñas), para no vaciar el formulario tras un error. */
  values?: Record<string, string>
}
