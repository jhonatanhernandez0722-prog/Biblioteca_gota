import { TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { formatDate } from '@/lib/dates'
import { fillParty, LEGAL_HISTORY, type LegalDocument } from '@/lib/legal'
import { getLegalParty } from '@/server/site'
import styles from '@/app/(site)/prose.module.css'

/** Página de un documento legal: texto versionado, fecha de vigencia e historial. */
export function LegalDocumentView({ doc, children }: { doc: LegalDocument; children?: ReactNode }) {
  const party = getLegalParty()
  const fill = (text: string) => fillParty(text, party)
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <h1>{doc.title}</h1>
        <p className={styles.lead}>{doc.summary}</p>
        <p className="meta">
          Versión {doc.version}, vigente desde el {formatDate(`${doc.effectiveAt}T12:00:00Z`)}.{' '}
          <Link href="/legal/historial" className="link">
            Historial de versiones
          </Link>
          {LEGAL_HISTORY[doc.slug].length ? ` (${LEGAL_HISTORY[doc.slug].length} anteriores)` : ''}
        </p>
      </header>
      {party.incomplete ? (
        <div className="alert alert--warning" role="note" style={{ marginBottom: 32 }}>
          <TriangleAlert aria-hidden="true" />
          <p>
            <strong>Borrador pendiente de datos del responsable.</strong> Faltan la identificación y los datos de
            contacto del titular (variables LEGAL_*). Este documento no debe considerarse definitivo hasta completarlos y
            revisarlo con asesoría jurídica.
          </p>
        </div>
      ) : null}
      <div className={styles.prose}>
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs?.map((p) => <p key={p}>{fill(p)}</p>)}
            {section.items ? (
              <ul>
                {section.items.map((item) => (
                  <li key={item}>{fill(item)}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
        {children}
      </div>
    </div>
  )
}
