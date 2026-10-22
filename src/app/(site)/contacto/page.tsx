import { Clock, Mail, MapPin, Phone } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getLibraryInfo } from '@/server/site'
import styles from '../prose.module.css'

export const metadata: Metadata = { title: 'Contacto' }

export default function ContactPage() {
  const info = getLibraryInfo()
  const subject = encodeURIComponent('Consulta para Biblioteca Gota Gota')
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <h1>Contacto</h1>
        <p className={styles.lead}>
          Para dudas sobre un préstamo, una reserva o tu cuenta, escríbenos o pasa por el mostrador.
        </p>
      </header>
      {info.isSample ? (
        <p className="alert alert--warning" style={{ marginBottom: 32 }}>
          Estos datos de contacto son de ejemplo. Se configuran con las variables LIBRARY_* del servidor.
        </p>
      ) : null}
      <div className={styles.layout}>
        <div className={styles.prose}>
          <ul role="list" style={{ paddingLeft: 0, gap: 24 }}>
            <li style={{ display: 'flex', gap: 16 }}>
              <MapPin aria-hidden="true" style={{ flex: 'none', color: 'var(--water-deep)' }} />
              <span>
                <strong>Dirección</strong>
                <br />
                {info.address}
              </span>
            </li>
            <li style={{ display: 'flex', gap: 16 }}>
              <Clock aria-hidden="true" style={{ flex: 'none', color: 'var(--water-deep)' }} />
              <span>
                <strong>Horario del mostrador</strong>
                <br />
                {info.hours}
              </span>
            </li>
            <li style={{ display: 'flex', gap: 16 }}>
              <Mail aria-hidden="true" style={{ flex: 'none', color: 'var(--water-deep)' }} />
              <span>
                <strong>Correo</strong>
                <br />
                <a href={`mailto:${info.email}`}>{info.email}</a>
              </span>
            </li>
            <li style={{ display: 'flex', gap: 16 }}>
              <Phone aria-hidden="true" style={{ flex: 'none', color: 'var(--water-deep)' }} />
              <span>
                <strong>Teléfono</strong>
                <br />
                <a href={`tel:${info.phone.replace(/\s/g, '')}`}>{info.phone}</a>
              </span>
            </li>
          </ul>
        </div>
        <aside className={styles.aside} aria-labelledby="escribir">
          <h2 id="escribir">Escríbenos</h2>
          <p>Indica tu número de carné si tu consulta es sobre un préstamo: así podremos ayudarte antes.</p>
          <a href={`mailto:${info.email}?subject=${subject}`} className="btn btn--block">
            <Mail aria-hidden="true" />
            Escribir un correo
          </a>
          <Link href="/como-funciona" className="link">
            Antes, mira las preguntas frecuentes
          </Link>
        </aside>
      </div>
    </div>
  )
}
