import styles from './Ripples.module.css'

/**
 * Ondas: la firma visual. Elipses concéntricas vistas en perspectiva, como el agua
 * cuando cae una gota. Con `animate`, se abren una vez al cargar (si el usuario
 * no ha pedido reducir el movimiento).
 */
export function Ripples({
  rings = 4,
  color = 'var(--water)',
  animate = false,
  delayMs = 0,
  className,
}: {
  rings?: number
  color?: string
  animate?: boolean
  /** Retraso antes de que se abra la primera onda. */
  delayMs?: number
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 400 120"
      className={`${styles.ripples} ${animate ? styles.animate : ''} ${className ?? ''}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {Array.from({ length: rings }, (_, i) => {
        const t = (i + 1) / rings
        return (
          <ellipse
            key={i}
            cx="200"
            cy="60"
            rx={60 + 140 * t}
            ry={14 + 44 * t}
            fill="none"
            stroke={color}
            strokeWidth={3.2 - 1.6 * t}
            strokeOpacity={1 - 0.72 * t}
            style={{ animationDelay: `${delayMs + i * 140}ms` }}
          />
        )
      })}
    </svg>
  )
}
