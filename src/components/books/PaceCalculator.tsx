'use client'

import { useId, useState } from 'react'
import styles from './PaceCalculator.module.css'

/**
 * «Gota a gota»: cuántos días tardarías en leer un libro según tu ritmo, y si te
 * alcanza el plazo de préstamo. Cada gota es un día de lectura.
 * Usa datos reales: las páginas del libro y las reglas de préstamo del servidor.
 */
export function PaceCalculator({
  title,
  pageCount,
  loanDays,
  maxRenewals,
  tone = 'paper',
  defaultPages = 20,
}: {
  title: string
  pageCount: number
  loanDays: number
  maxRenewals: number
  tone?: 'paper' | 'ink'
  defaultPages?: number
}) {
  const id = useId()
  const [pagesPerDay, setPagesPerDay] = useState(defaultPages)
  const days = Math.max(1, Math.ceil(pageCount / pagesPerDay))
  const maxDays = loanDays * (maxRenewals + 1)
  const renewalsNeeded = Math.max(0, Math.ceil(days / loanDays) - 1)
  const fits = days <= maxDays
  const shown = Math.min(days, maxDays + loanDays)
  const neededPace = Math.ceil(pageCount / maxDays)

  const times = (n: number) => (n === 1 ? 'una vez' : n === 2 ? 'dos veces' : `${n} veces`)
  let verdict: string
  if (days <= loanDays) {
    verdict = `Te alcanza el préstamo de ${loanDays} días${days < loanDays ? ` y te sobran ${loanDays - days}` : ''}.`
  } else if (fits) {
    verdict = `Te da tiempo si lo renuevas ${times(renewalsNeeded)}${renewalsNeeded === maxRenewals ? ', el máximo permitido' : ''}.`
  } else {
    verdict = `Es más de lo que permite el préstamo, incluso renovándolo (${maxDays} días). Con ${neededPace} páginas al día llegarías a tiempo.`
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
          const period = Math.ceil(day / loanDays)
          const className =
            period === 1 ? styles.p1 : period <= maxRenewals + 1 ? styles.p2 : styles.over
          return <span key={i} className={`${styles.drop} ${className}`} />
        })}
        {days > shown ? <span className={styles.more}>+{days - shown}</span> : null}
      </div>
      <ul className={styles.legend} aria-label="Leyenda">
        <li>
          <span className={`${styles.drop} ${styles.p1}`} aria-hidden="true" /> Préstamo ({loanDays} días)
        </li>
        <li>
          <span className={`${styles.drop} ${styles.p2}`} aria-hidden="true" /> Con renovaciones
        </li>
        <li>
          <span className={`${styles.drop} ${styles.over}`} aria-hidden="true" /> Fuera de plazo
        </li>
      </ul>
    </div>
  )
}
