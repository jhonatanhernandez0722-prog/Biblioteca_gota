import Link from 'next/link'
import { Logo } from '@/components/brand/Logo'
import { Ripples } from '@/components/brand/Ripples'
import { BookCover } from '@/components/books/BookCover'
import { getHeroBooks } from '@/server/catalog'
import styles from './auth.module.css'

// Las portadas salen de la base de datos en cada visita, no del momento de compilar.
export const dynamic = 'force-dynamic'

/** Acceso: un campo de tinta con portadas reales sobre el agua y el formulario sobre papel. */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const covers = await getHeroBooks(3)
  return (
    <div className={styles.shell}>
      <aside className={`${styles.brand} on-ink`}>
        <Logo tone="paper" />
        <div className={styles.scene} aria-hidden="true">
          <div className={styles.fan}>
            <div className={styles.ripples}>
              <Ripples rings={4} />
            </div>
            {covers.map((book, i) => (
              <BookCover
                key={book.id}
                title={book.title}
                authors={book.authors}
                coverKey={book.coverKey}
                coverColor={book.coverColor}
                sizes="200px"
                className={`${styles.cover} ${styles[`cover${i}`]}`}
              />
            ))}
          </div>
        </div>
        <div className={styles.brandText}>
          <p className={styles.brandTitle}>Tu biblioteca, a una búsqueda de distancia.</p>
          <p className={styles.brandLead}>
            Pide libros, resérvalos cuando estén prestados y consulta tus fechas de devolución desde cualquier lugar.
          </p>
        </div>
      </aside>
      <main id="contenido" tabIndex={-1} className={styles.main}>
        <div className={styles.formWrap}>{children}</div>
        <p className={styles.back}>
          <Link href="/" className="link">
            Volver a la biblioteca
          </Link>
        </p>
      </main>
    </div>
  )
}
