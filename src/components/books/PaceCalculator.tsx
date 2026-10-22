'use client'

import { useId, useState } from 'react'
import styles from './PaceCalculator.module.css'

/**
 * «Gota a gota»: cuántos días tardarías en leer un libro según tu ritmo, y qué plazo de
 * lectura te conviene elegir al pedirlo. Cada gota es un día de lectura.
 * Usa datos reales: las páginas del libro y los plazos de préstamo del servidor.
 */
export function PaceCalculator({
  title,
  pageCount,
  periods,
  tone = 'paper',
  defaultPages = 20,
}: {
  title: string
  pageCount: number
  /** Plazos de lectura que se pueden elegir, de menor a mayor. */
  periods: readonly number[]
  tone?: 'paper' | 'ink'
  defaultPages?: number
}) {
  const id = useId()
  const [pagesPerDay, setPagesPerDay] = useState(defaultPages)
  const days = Math.max(1, Math.ceil(pageCount / pagesPerDay))
  const shortest = periods[0]!
  const longest = periods.at(-1)!
  const fitting = periods.find((p) => p >= days)
  const shown = Math.min(days, longest + shortest)
  const neededPace = Math.ceil(pageCount / longest)

  let verdict: string
  if (fitting) {
    const spare = fitting - days
    verdict = `Elige el plazo de ${fitting} días${spare > 0 ? ` y te sobran ${spare}` : ''}.`
  } else {
    verdict = `Es más que el plazo más largo (${longest} días), y los préstamos no se renuevan. Con ${neededPace} páginas al día llegarías a tiempo.`
  }

  return (
    <div className={`${styles.calc} ${tone === 'ink' ? styles.ink : ''}`}>
      <div className={styles.control}>
        <label htmlFor={`${id}-pace`} className={styles.label}>
          Páginas que lees al día
        </label>
        <div className={styles.sliderRow}>
          <input
            id={`${id}-pace`}
            type="range"
            min={5}
            max={100}
            step={5}
            value={pagesPerDay}
            onChange={(e) => setPagesPerDay(Number(e.target.value))}
            className={styles.slider}
            aria-describedby={`${id}-result`}
          />
          <output htmlFor={`${id}-pace`} className={styles.value}>
            {pagesPerDay}
          </output>
        </div>
      </div>

      <p id={`${id}-result`} className={styles.result} aria-live="polite">
        <span className={styles.days}>
          {days} {days === 1 ? 'día' : 'días'}
        </span>{' '}
        para terminar «{title}» ({pageCount} páginas). {verdict}
      </p>

      <div className={styles.drops} aria-hidden="true">
        {Array.from({ length: shown }, (_, i) => {
          const day = i + 1
          const className = day <= shortest ? styles.p1 : day <= longest ? styles.p2 : styles.over
          return <span key={i} className={`${styles.drop} ${className}`} />
        })}
        {days > shown ? <span className={styles.more}>+{days - shown}</span> : null}
      </div>
      <ul className={styles.legend} aria-label="Leyenda">
        <li>
          <span className={`${styles.drop} ${styles.p1}`} aria-hidden="true" /> Plazo corto ({shortest} días)
        </li>
        <li>
          <span className={`${styles.drop} ${styles.p2}`} aria-hidden="true" /> Hasta {longest} días
        </li>
        <li>
          <span className={`${styles.drop} ${styles.over}`} aria-hidden="true" /> Fuera de plazo
        </li>
      </ul>
    </div>
  )
}
