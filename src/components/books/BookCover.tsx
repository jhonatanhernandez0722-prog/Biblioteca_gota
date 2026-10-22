import Image from 'next/image'
import type { CSSProperties } from 'react'
import { DropMark } from '@/components/brand/DropMark'
import styles from './BookCover.module.css'

const GENERATED_PALETTE = [
  { bg: '#16324F', fg: '#FAF8F2', accent: '#56B8B0' },
  { bg: '#244A68', fg: '#FAF8F2', accent: '#56B8B0' },
  { bg: '#287F7A', fg: '#FAF8F2', accent: '#16324F' },
  { bg: '#E4F3F1', fg: '#16324F', accent: '#287F7A' },
  { bg: '#F2EEE3', fg: '#16324F', accent: '#287F7A' },
]

function pick(title: string) {
  let hash = 0
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) >>> 0
  return GENERATED_PALETTE[hash % GENERATED_PALETTE.length]!
}

/**
 * Portada en proporción 2:3 fija. Sin imagen, se compone una portada tipográfica
 * con la identidad de la biblioteca (nunca un rectángulo gris vacío).
 */
export function BookCover({
  title,
  authors,
  coverKey,
  coverColor,
  sizes = '(max-width: 640px) 45vw, 220px',
  alt = '',
  preload = false,
  className,
  style,
}: {
  title: string
  authors: string[]
  coverKey: string | null
  coverColor?: string | null
  sizes?: string
  alt?: string
  preload?: boolean
  className?: string
  style?: CSSProperties
}) {
  if (coverKey) {
    return (
      <div
        className={`cover ${className ?? ''}`}
        style={{ ...style, ['--cover-bg' as string]: coverColor ?? undefined }}
      >
        <Image src={`/media/covers/${coverKey}`} alt={alt} fill sizes={sizes} preload={preload} quality={75} />
      </div>
    )
  }
  const palette = pick(title)
  return (
    <div
      className={`cover ${styles.generated} ${className ?? ''}`}
      style={{ ...style, ['--cover-bg' as string]: palette.bg, color: palette.fg }}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <span className={styles.title}>{title}</span>
      <span className={styles.author}>{authors[0] ?? ''}</span>
      <DropMark size={22} className={styles.mark} spine={palette.bg} ink={palette.fg} water={palette.accent} />
    </div>
  )
}
