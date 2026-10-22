import type { Metadata } from 'next'
import Link from 'next/link'
import { BookCover } from '@/components/books/BookCover'
import { getCategoryIndex, searchBooks } from '@/server/catalog'
import styles from './categorias.module.css'

export const metadata: Metadata = {
  title: 'Categorías',
  description: 'Explora el catálogo de Biblioteca Gota Gota por categorías: novela, poesía, ensayo, teatro y más.',
}

export default async function CategoriesPage() {
  const categories = await getCategoryIndex()
  return (
    <div className="container">
      <header className={styles.head}>
        <h1>Categorías</h1>
        <p className={styles.lead}>
          {categories.length} categorías, con los títulos que la biblioteca tiene hoy. Un libro puede estar en varias.
        </p>
      </header>

      {categories.length === 0 ? (
        <div className="empty">
          <h2>Todavía no hay categorías con libros</h2>
          <p>Cuando el equipo añada libros al catálogo, aparecerán aquí agrupados por tema.</p>
          <Link href="/explorar" className="btn">
            Ver el catálogo
          </Link>
        </div>
      ) : (
        <ul role="list" className={styles.list}>
          {(await Promise.all(categories.map(async (category) => {
            const books = (await searchBooks({ category: category.slug, sort: 'recent', pageSize: 5 })).items
            return (
              <li key={category.id} className={styles.item}>
                <div className={styles.text}>
                  <h2 className={styles.name}>
                    <Link href={`/explorar?categoria=${category.slug}`}>{category.name}</Link>
                  </h2>
                  <p className={styles.count}>
                    {category.bookCount} {category.bookCount === 1 ? 'título' : 'títulos'}
                  </p>
                  {category.description ? <p>{category.description}</p> : null}
                </div>
                <ul role="list" className={styles.covers} aria-label={`Algunos títulos de ${category.name}`}>
                  {books.map((book) => (
                    <li key={book.id}>
                      <Link href={`/libros/${book.slug}`} className={styles.coverLink} title={book.title}>
                        <BookCover
                          title={book.title}
                          authors={book.authors}
                          coverKey={book.coverKey}
                          coverColor={book.coverColor}
                          sizes="110px"
                          alt={book.title}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            )
          })))}
        </ul>
      )}
    </div>
  )
}
