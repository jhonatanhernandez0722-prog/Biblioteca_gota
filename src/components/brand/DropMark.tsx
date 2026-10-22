import type { CSSProperties } from 'react'

/**
 * Símbolo de Biblioteca Gota Gota: una gota partida por el lomo.
 * La mitad de tinta y la de agua se separan como las dos páginas de un libro
 * que se abre; la ranura es el lomo. `spine` debe ser el color del fondo.
 */
export function DropMark({
  size = 40,
  spine = 'var(--paper)',
  ink = 'var(--ink)',
  water = 'var(--water)',
  pages = false,
  title,
  className,
  style,
}: {
  size?: number
  spine?: string
  ink?: string
  water?: string
  /** Añade los cantos de las páginas (solo a tamaños grandes). */
  pages?: boolean
  title?: string
  className?: string
  style?: CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 40 52"
      width={size * (40 / 52)}
      height={size}
      className={className}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <path d="M20 1C20 1 2 21.5 2 33a18 18 0 0 0 18 18Z" fill={ink} />
      <path d="M20 1c0 0 18 20.5 18 32a18 18 0 0 1-18 18Z" fill={water} />
      {pages ? (
        <g fill="none" stroke={spine} strokeOpacity="0.55" strokeWidth="0.7" strokeLinecap="round">
          <path d="M23.5 47.6a14.6 14.6 0 0 0 11-14.2" />
          <path d="M23.5 44.1a11.2 11.2 0 0 0 7.6-10.6" />
          <path d="M16.5 47.6a14.6 14.6 0 0 1-11-14.2" />
          <path d="M16.5 44.1a11.2 11.2 0 0 1-7.6-10.6" />
        </g>
      ) : null}
      <path d="M20 13.5V52" stroke={spine} strokeWidth="2.6" />
    </svg>
  )
}
