import { BookX, CircleCheck, Clock } from 'lucide-react'

/** Disponibilidad con icono y texto: nunca depende solo del color. */
export function AvailabilityBadge({
  available,
  total,
  waiting = 0,
  showCount = false,
}: {
  available: number
  total: number
  waiting?: number
  showCount?: boolean
}) {
  if (total === 0) {
    return (
      <span className="badge">
        <BookX aria-hidden="true" />
        Sin ejemplares
      </span>
    )
  }
  if (available > 0) {
    return (
      <span className="badge badge--success">
        <CircleCheck aria-hidden="true" />
        {showCount ? `${available} ${available === 1 ? 'disponible' : 'disponibles'}` : 'Disponible'}
      </span>
    )
  }
  return (
    <span className="badge badge--warning">
      <Clock aria-hidden="true" />
      {waiting > 0 ? `En préstamo, ${waiting} en espera` : 'En préstamo'}
    </span>
  )
}
