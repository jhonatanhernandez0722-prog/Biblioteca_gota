import type { Metadata } from 'next'
import Link from 'next/link'
import { formatDate } from '@/lib/dates'
import { LEGAL_DOCUMENTS, LEGAL_HISTORY, LEGAL_PATH } from '@/lib/legal'
import styles from '../../prose.module.css'

export const metadata: Metadata = { title: 'Historial de versiones legales' }

export default function LegalHistoryPage() {
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <h1>Historial de versiones</h1>
        <p className={styles.lead}>
          Cada documento conserva sus versiones. Cuando cambia, publicamos una nueva con su fecha de entrada en vigor y, si
          te afecta, te pedimos aceptarla al entrar.
        </p>
      </header>
      <div className={styles.prose}>
        {Object.values(LEGAL_DOCUMENTS).map((doc) => (
          <section key={doc.slug}>
            <h2>
              <Link href={LEGAL_PATH[doc.slug]}>{doc.title}</Link>
            </h2>
            <ul>
              <li>
                Versión {doc.version} (vigente desde el {formatDate(`${doc.effectiveAt}T12:00:00Z`)}): {doc.changes}
              </li>
              {LEGAL_HISTORY[doc.slug].map((old) => (
                <li key={old.version}>
                  Versión {old.version} (desde el {formatDate(`${old.effectiveAt}T12:00:00Z`)}): {old.changes}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <h2>Cómo se actualizan</h2>
        <ol>
          <li>Se redacta la nueva versión y se revisa con asesoría jurídica.</li>
          <li>Se publica con un número de versión nuevo y su fecha de entrada en vigor; la anterior pasa a este historial.</li>
          <li>Si el cambio afecta a lo que aceptaste, se te pide aceptar la nueva versión antes de seguir pidiendo libros.</li>
        </ol>
      </div>
    </div>
  )
}
