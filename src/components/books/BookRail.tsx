'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import styles from './BookRail.module.css'

/** Carril horizontal con ajuste por portada. Los botones solo aparecen si hay más contenido. */
export function BookRail({ label, children }: { label: string; children: ReactNode }) {
  const track = useRef<HTMLUListElement>(null)
  const [edges, setEdges] = useState({ start: true, end: false })

  useEffect(() => {
    const el = track.current
    if (!el) return
    const update = () =>
      setEdges({
        start: el.scrollLeft <= 4,
        end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
      })
    update()
    el.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  const scroll = (direction: 1 | -1) => {
    const el = track.current
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: reduce ? 'auto' : 'smooth' })
  }

  return (
    <div className={styles.rail}>
      <ul ref={track} className={styles.track} role="list" aria-label={label}>
        {children}
      </ul>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.control}
          onClick={() => scroll(-1)}
          disabled={edges.start}
          aria-label={`Anteriores en ${label}`}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.control}
          onClick={() => scroll(1)}
          disabled={edges.end}
          aria-label={`Siguientes en ${label}`}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export function BookRailItem({ children }: { children: ReactNode }) {
  return <li className={styles.item}>{children}</li>
}
