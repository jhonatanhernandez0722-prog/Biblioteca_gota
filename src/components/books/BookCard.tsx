import Link from 'next/link'
import { joinAuthors } from '@/lib/text'
import type { BookSummary } from '@/lib/types'
import { AvailabilityBadge } from './AvailabilityBadge'
import { BookCover } from './BookCover'
import styles from './BookCard.module.css'

/**
 * La portada es la tarjeta: sin caja alrededor. Un único enlace (el título) cubre
 * toda la superficie, así el lector de pantalla oye el libro una sola vez.
 */
export function BookCard({
  book,
  sizes,
  note,
  headingLevel = 3,
  showCategory = true,
}: {
  book: BookSummary
  sizes?: string
  /** Línea extra bajo el autor (p. ej. la fecha de llegada). */
  note?: string
  headingLevel?: 2 | 3 | 4
  showCategory?: boolean
}) {
  const Heading = `h${headingLevel}` as const
  return (
    <article className={styles.card}>
      <BookCover
        title={book.title}
        authors={book.authors}
        coverKey={book.coverKey}
        coverColor={book.coverColor}
        sizes={sizes}
        className={styles.cover}
      />
      <div className={styles.body}>
        <Heading className={styles.title}>
          <Link href={`/libros/${book.slug}`} className={styles.link}>
            {book.title}
          </Link>
        </Heading>
        <p className={styles.author}>{joinAuthors(book.authors)}</p>
        {showCategory && book.categories[0] ? <p className={styles.category}>{book.categories[0].name}</p> : null}
        {note ? <p className={styles.note}>{note}</p> : null}
        <div className={styles.status}>
          <AvailabilityBadge available={book.availableCopies} total={book.totalCopies} />
        </div>
      </div>
    </article>
  )
}
