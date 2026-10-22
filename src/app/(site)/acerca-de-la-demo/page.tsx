import type { Metadata } from 'next'
import Link from 'next/link'
import styles from '../prose.module.css'

export const metadata: Metadata = { title: 'Qué datos son reales', robots: { index: false } }

export default function AboutDemoPage() {
  return (
    <div className={`container ${styles.page}`}>
      <header className={styles.head}>
        <h1>Qué datos son reales en esta demostración</h1>
        <p className={styles.lead}>
          La aplicación funciona de verdad, pero la biblioteca todavía no ha cargado su catálogo ni sus lectores.
        </p>
      </header>
      <div className={styles.prose}>
        <h2>Reales</h2>
        <ul>
          <li>
            Los <strong>títulos y autores</strong> del catálogo: son libros que existen.
          </li>
          <li>
            Los <strong>datos de cada edición</strong> (editorial, año, ISBN, páginas) y las <strong>portadas</strong>:
            se importaron de{' '}
            <a href="https://openlibrary.org" target="_blank" rel="noopener noreferrer">
              Open Library
            </a>
            , cuyos datos bibliográficos son de dominio público (CC0).
          </li>
          <li>
            Las <strong>reglas de préstamo</strong>: el servidor las aplica en cada operación.
          </li>
        </ul>

        <h2>De ejemplo</h2>
        <ul>
          <li>Los ejemplares físicos, sus códigos y su ubicación en las estanterías.</li>
          <li>Las personas lectoras y del equipo, y sus préstamos, reservas e historial.</li>
          <li>Las sinopsis y la recomendación editorial, escritas para la demostración.</li>
          <li>Los datos de contacto de la biblioteca.</li>
        </ul>

        <h2>Lo que no hacemos</h2>
        <p>
          No mostramos estadísticas, reseñas ni popularidad inventadas. La sección «Más pedidos» solo aparece cuando hay
          suficientes préstamos reales para que el ranking signifique algo.
        </p>
        <p>
          <Link href="/explorar">Explora el catálogo</Link> o entra con una de las cuentas de demostración desde{' '}
          <Link href="/entrar">Entrar</Link>.
        </p>
      </div>
    </div>
  )
}
