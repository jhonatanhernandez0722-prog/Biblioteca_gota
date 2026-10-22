import type {
  CopyCondition,
  CopyStatus,
  FineStatus,
  LoanStatus,
  ReservationStatus,
  Role,
} from './types'

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand'

export type LoanDisplayStatus = LoanStatus | 'overdue'

export const LOAN_STATUS: Record<LoanDisplayStatus, { label: string; tone: Tone; help: string }> = {
  pending: {
    label: 'Pendiente',
    tone: 'info',
    help: 'El equipo de la biblioteca revisará tu solicitud.',
  },
  approved: {
    label: 'Lista para recoger',
    tone: 'brand',
    help: 'Tu ejemplar está apartado en el mostrador.',
  },
  checked_out: { label: 'Prestado', tone: 'success', help: 'El libro está contigo.' },
  overdue: {
    label: 'Vencido',
    tone: 'danger',
    help: 'La fecha de devolución ya pasó. Devuélvelo cuanto antes.',
  },
  returned: { label: 'Devuelto', tone: 'neutral', help: 'Préstamo cerrado.' },
  rejected: { label: 'Rechazada', tone: 'danger', help: 'La biblioteca no aprobó la solicitud.' },
  cancelled: { label: 'Cancelada', tone: 'neutral', help: 'La solicitud se canceló.' },
  expired: {
    label: 'No recogida',
    tone: 'warning',
    help: 'El plazo para recoger el ejemplar terminó.',
  },
}

export function loanDisplayStatus(
  status: LoanStatus,
  dueAt: string | null,
  now = new Date(),
): LoanDisplayStatus {
  if (status === 'checked_out' && dueAt && new Date(dueAt).getTime() < now.getTime()) {
    return 'overdue'
  }
  return status
}

export const COPY_STATUS: Record<CopyStatus, { label: string; tone: Tone }> = {
  available: { label: 'Disponible', tone: 'success' },
  reserved: { label: 'Apartado', tone: 'brand' },
  on_loan: { label: 'Prestado', tone: 'info' },
  maintenance: { label: 'En reparación', tone: 'warning' },
  lost: { label: 'Extraviado', tone: 'danger' },
  withdrawn: { label: 'Retirado', tone: 'neutral' },
}

export const COPY_CONDITION: Record<CopyCondition, string> = {
  new: 'Nuevo',
  good: 'Buen estado',
  worn: 'Desgastado',
  damaged: 'Dañado',
}

export const RESERVATION_STATUS: Record<ReservationStatus, { label: string; tone: Tone }> = {
  waiting: { label: 'En espera', tone: 'info' },
  fulfilled: { label: 'Atendida', tone: 'success' },
  cancelled: { label: 'Cancelada', tone: 'neutral' },
}

export const FINE_STATUS: Record<FineStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Por pagar', tone: 'danger' },
  paid: { label: 'Pagada', tone: 'success' },
  waived: { label: 'Condonada', tone: 'neutral' },
}

export const ROLE_LABEL: Record<Role, string> = {
  reader: 'Lector',
  librarian: 'Bibliotecario',
  admin: 'Administrador',
}

export function isStaff(role: Role | null | undefined): boolean {
  return role === 'librarian' || role === 'admin'
}
