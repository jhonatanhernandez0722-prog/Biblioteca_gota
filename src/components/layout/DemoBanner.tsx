import { Info } from 'lucide-react'
import Link from 'next/link'
import styles from './DemoBanner.module.css'

/** Aviso permanente mientras la biblioteca funciona con datos de demostración. */
export function DemoBanner() {
  return (
    <div className={styles.banner} role="note">
      <div className={`container ${styles.inner}`}>
        <Info aria-hidden="true" />
        <p>
          Demostración: los títulos son reales; ejemplares, lectores y préstamos son de ejemplo.{' '}
          <Link href="/acerca-de-la-demo">Qué es real</Link>
        </p>
      </div>
    </div>
  )
}
