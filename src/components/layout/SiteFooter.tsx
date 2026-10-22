import Link from 'next/link'
import { DropMark } from '@/components/brand/DropMark'
import { getLibraryInfo } from '@/server/site'
import styles from './SiteFooter.module.css'

export function SiteFooter({ signedIn }: { signedIn: boolean }) {
  const info = getLibraryInfo()
  const year = new Date().getFullYear()
  return (
    <footer className={`${styles.footer} on-ink`}>
      <div className="container">
        <div className={styles.columns}>
          <nav aria-label="Biblioteca" className={styles.col}>
            <h2 className={styles.heading}>Biblioteca</h2>
            <ul role="list">
              <li><Link href="/explorar">Explorar libros</Link></li>
              <li><Link href="/explorar?orden=recientes">Novedades</Link></li>
              <li><Link href="/categorias">Categorías</Link></li>
              <li><Link href="/como-funciona">Cómo funciona el préstamo</Link></li>
            </ul>
          </nav>
          <nav aria-label="Tu cuenta" className={styles.col}>
            <h2 className={styles.heading}>Tu cuenta</h2>
            <ul role="list">
              {signedIn ? (
                <>
                  <li><Link href="/cuenta">Mis préstamos</Link></li>
                  <li><Link href="/cuenta/perfil">Mi perfil</Link></li>
                </>
              ) : (
                <>
                  <li><Link href="/entrar">Entrar</Link></li>
                  <li><Link href="/registro">Crear cuenta</Link></li>
                  <li><Link href="/recuperar">Recuperar contraseña</Link></li>
                </>
              )}
            </ul>
          </nav>
          <nav aria-label="Información" className={styles.col}>
            <h2 className={styles.heading}>Información</h2>
            <ul role="list">
              <li><Link href="/terminos">Términos y condiciones</Link></li>
              <li><Link href="/privacidad">Privacidad y datos personales</Link></li>
              <li><Link href="/cookies">Cookies y preferencias</Link></li>
              <li><Link href="/reembolsos">Reembolsos y cancelaciones</Link></li>
              <li><Link href="/condiciones">Condiciones de préstamo</Link></li>
              <li><Link href="/accesibilidad">Accesibilidad</Link></li>
              <li><Link href="/contacto">Contacto</Link></li>
            </ul>
          </nav>
          <div className={styles.col}>
            <h2 className={styles.heading}>Visítanos</h2>
            <address className={styles.address}>
              <span>{info.address}</span>
              <span>{info.hours}</span>
              <a href={`mailto:${info.email}`}>{info.email}</a>
              <a href={`tel:${info.phone.replace(/\s/g, '')}`}>{info.phone}</a>
            </address>
            {info.isSample ? <p className={styles.sample}>Datos de contacto de ejemplo.</p> : null}
          </div>
        </div>

        <div className={styles.signature}>
          <DropMark size={92} spine="var(--ink)" ink="var(--paper)" pages className={styles.mark} />
          <p className={styles.name} aria-label="Biblioteca Gota Gota">
            Gota Gota
          </p>
        </div>

        <div className={styles.bottom}>
          <p>© {year} Biblioteca Gota Gota. Cada libro, una gota de conocimiento.</p>
          <p>
            Datos bibliográficos y portadas:{' '}
            <a href="https://openlibrary.org" rel="noopener noreferrer" target="_blank">
              Open Library
            </a>{' '}
            (CC0). Tipografías Manrope y DM Serif Display (OFL).
          </p>
        </div>
      </div>
    </footer>
  )
}
