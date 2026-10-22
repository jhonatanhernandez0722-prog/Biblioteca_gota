import { BookOpen, Search } from 'lucide-react'
import Link from 'next/link'
import { DropMark } from '@/components/brand/DropMark'
import { Ripples } from '@/components/brand/Ripples'
import { AvailabilityBadge } from '@/components/books/AvailabilityBadge'
import { BookCard } from '@/components/books/BookCard'
import { BookCover } from '@/components/books/BookCover'
import { BookRail, BookRailItem } from '@/components/books/BookRail'
import { PaceCalculator } from '@/components/books/PaceCalculator'
import { formatShortDate } from '@/lib/dates'
import { LOAN_RULES } from '@/lib/rules'
import { joinAuthors, truncate } from '@/lib/text'
import { getCurrentUser } from '@/server/auth/current-user'
import {
  getAvailableBooks,
  getBookById,
  getCategoryIndex,
  getEditorialPick,
  getFeaturedBooks,
  getHeroBooks,
  getLatestBooks,
  getMostBorrowed,
  getSearchSuggestions,
} from '@/server/catalog'
import { listUserLoans } from '@/server/circulation'
import styles from './page.module.css'

export default async function HomePage() {
  const user = await getCurrentUser()
  // Cada libro aparece una sola vez en la portada: las secciones se reparten el catálogo.
  const shown = new Set<number>()
  const take = <T extends { id: number }>(list: T[], count: number): T[] => {
    const picked = list.filter((b) => !shown.has(b.id)).slice(0, count)
    picked.forEach((b) => shown.add(b.id))
    return picked
  }
  const pick = await getEditorialPick()
  if (pick) shown.add(pick.id)
  const heroBooks = take(await getHeroBooks(8), 3)
  const suggestions = await getSearchSuggestions()
  const [leadSummary, ...moreFeatured] = take(await getFeaturedBooks(12), 4)
  const lead = leadSummary ? await getBookById(leadSummary.id) : null
  const latest = take(await getLatestBooks(24), 10)
  const mostBorrowed = await getMostBorrowed()
  const categories = (await getCategoryIndex()).slice(0, 10)
  const available = take(await getAvailableBooks(30, [...shown]), 10)
  const activeLoans = user
    ? (await listUserLoans(user.id)).filter((l) => ['pending', 'approved', 'checked_out'].includes(l.status)).length
    : 0

  const front = heroBooks[0]
  const [left, right] = [heroBooks[1], heroBooks[2]]

  return (
    <>
      {/* ───────────── Hero ───────────── */}
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={`container ${styles.heroGrid}`}>
          <div className={styles.heroText}>
            <p className={styles.kicker}>Un mundo de historias te espera</p>
            <h1 id="hero-title" className={styles.heroTitle}>
              Cada libro, una nueva forma de ver el mundo
            </h1>
            <p className={styles.heroLead}>
              Descubre nuevas historias, encuentra tu próxima lectura y comparte el conocimiento, gota a gota.
            </p>

            <form action="/explorar" method="get" role="search" className={styles.search}>
              <label htmlFor="hero-search" className="visually-hidden">
                Buscar por título, autor, tema o ISBN
              </label>
              <Search aria-hidden="true" className={styles.searchIcon} />
              <input
                id="hero-search"
                name="q"
                type="search"
                className={styles.searchInput}
                placeholder="Título, autor o tema"
                autoComplete="off"
                enterKeyHint="search"
              />
              <button type="submit" className={`btn btn--brand ${styles.searchButton}`}>
                Buscar
              </button>
            </form>
            {suggestions.length ? (
              <p className={styles.suggestions}>
                <span>Prueba con</span>
                {suggestions.map((s) => (
                  <Link key={s} href={`/explorar?q=${encodeURIComponent(s)}`} className="chip">
                    {s}
                  </Link>
                ))}
              </p>
            ) : null}

            <div className={styles.heroActions}>
              <Link href="/explorar" className="btn">
                <BookOpen aria-hidden="true" />
                Explorar biblioteca
              </Link>
              <Link href="/como-funciona" className="btn btn--ghost">
                Cómo funciona
              </Link>
            </div>
          </div>

          <div className={styles.stage}>
            <div className={styles.fall} aria-hidden="true">
              <DropMark size={34} spine="var(--paper)" />
            </div>
            <div className={styles.fan}>
              <div className={styles.ripples}>
                <Ripples animate rings={4} delayMs={850} />
              </div>
              {left ? (
                <BookCover
                  title={left.title}
                  authors={left.authors}
                  coverKey={left.coverKey}
                  coverColor={left.coverColor}
                  sizes="(max-width: 960px) 30vw, 180px"
                  className={`${styles.fanCover} ${styles.fanLeft}`}
                />
              ) : null}
              {right ? (
                <BookCover
                  title={right.title}
                  authors={right.authors}
                  coverKey={right.coverKey}
                  coverColor={right.coverColor}
                  sizes="(max-width: 960px) 30vw, 180px"
                  className={`${styles.fanCover} ${styles.fanRight}`}
                />
              ) : null}
              {front ? (
                <Link href={`/libros/${front.slug}`} className={styles.fanFront} aria-label={`Ver «${front.title}»`}>
                  <BookCover
                    title={front.title}
                    authors={front.authors}
                    coverKey={front.coverKey}
                    coverColor={front.coverColor}
                    sizes="(max-width: 960px) 46vw, 260px"
                    preload
                  />
                </Link>
              ) : null}
            </div>
            {front ? (
              <p className={styles.caption}>
                <span className={styles.captionTitle}>
                  <Link href={`/libros/${front.slug}`}>{front.title}</Link>
                </span>
                <span className={styles.captionAuthor}>{joinAuthors(front.authors)}</span>
                <AvailabilityBadge available={front.availableCopies} total={front.totalCopies} />
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {/* ───────────── Selección ───────────── */}
      {lead ? (
        <section className={styles.selection} aria-labelledby="seleccion-title">
          <div className="container">
            <div className={styles.sectionHead}>
              <h2 id="seleccion-title">Selección de la biblioteca</h2>
              <p className={styles.sectionIntro}>Libros que el equipo de la biblioteca quiere poner en tus manos.</p>
            </div>
            <div className={styles.selectionGrid}>
              <Link href={`/libros/${lead.slug}`} className={styles.selectionCover} tabIndex={-1} aria-hidden="true">
                <BookCover
                  title={lead.title}
                  authors={lead.authors}
                  coverKey={lead.coverKey}
                  coverColor={lead.coverColor}
                  sizes="(max-width: 760px) 60vw, 300px"
                />
              </Link>
              <div className={styles.selectionText}>
                <h3 className={styles.selectionTitle}>
                  <Link href={`/libros/${lead.slug}`}>{lead.title}</Link>
                </h3>
                <p className={styles.selectionAuthor}>{joinAuthors(lead.authors)}</p>
                {lead.description ? (
                  <p className={styles.selectionDesc}>{truncate(lead.description.split('\n')[0]!, 320)}</p>
                ) : null}
                <div className={styles.chips}>
                  {lead.categories.map((c) => (
                    <Link key={c.slug} href={`/explorar?categoria=${c.slug}`} className="chip">
                      {c.name}
                    </Link>
                  ))}
                </div>
                <AvailabilityBadge available={lead.availableCopies} total={lead.totalCopies} />
                <Link href={`/libros/${lead.slug}`} className="btn btn--secondary">
                  Ver el libro
                </Link>
              </div>
              {moreFeatured.length ? (
                <ul role="list" className={styles.selectionList}>
                  {moreFeatured.map((book) => (
                    <li key={book.id} className={styles.selectionItem}>
                      <BookCover
                        title={book.title}
                        authors={book.authors}
                        coverKey={book.coverKey}
                        coverColor={book.coverColor}
                        sizes="88px"
                        className={styles.miniCover}
                      />
                      <div>
                        <h3 className={styles.miniTitle}>
                          <Link href={`/libros/${book.slug}`}>{book.title}</Link>
                        </h3>
                        <p className={styles.miniAuthor}>{joinAuthors(book.authors)}</p>
                        <AvailabilityBadge available={book.availableCopies} total={book.totalCopies} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {/* ───────────── Novedades ───────────── */}
      {latest.length ? (
        <section className={styles.section} aria-labelledby="novedades-title">
          <div className="container">
            <div className={styles.headRow}>
              <h2 id="novedades-title">Novedades</h2>
              <Link href="/explorar?orden=recientes" className="link">
                Ver todas las novedades
              </Link>
            </div>
            <BookRail label="Novedades">
              {latest.map((book) => (
                <BookRailItem key={book.id}>
                  <BookCard book={book} note={`Llegó el ${formatShortDate(book.createdAt)}`} sizes="196px" />
                </BookRailItem>
              ))}
            </BookRail>
          </div>
        </section>
      ) : null}

      {/* ───────────── Más consultados (solo con datos reales suficientes) ───────────── */}
      {mostBorrowed ? (
        <section className={styles.section} aria-labelledby="consultados-title">
          <div className="container">
            <div className={styles.headRow}>
              <h2 id="consultados-title">Más pedidos en los últimos {mostBorrowed.days} días</h2>
            </div>
            <ol className={styles.ranking}>
              {mostBorrowed.items.map(({ book, loans }, index) => (
                <li key={book.id} className={styles.rankItem}>
                  <span className={styles.rankNumber} aria-hidden="true">
                    {index + 1}
                  </span>
                  <BookCover
                    title={book.title}
                    authors={book.authors}
                    coverKey={book.coverKey}
                    coverColor={book.coverColor}
                    sizes="120px"
                    className={styles.rankCover}
                  />
                  <div>
                    <h3 className={styles.miniTitle}>
                      <Link href={`/libros/${book.slug}`}>{book.title}</Link>
                    </h3>
                    <p className={styles.miniAuthor}>{joinAuthors(book.authors)}</p>
                    <p className="meta">
                      {loans} {loans === 1 ? 'préstamo' : 'préstamos'}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ) : null}

      {/* ───────────── Categorías: un índice ───────────── */}
      {categories.length ? (
        <section className={styles.section} aria-labelledby="categorias-title">
          <div className={`container ${styles.indexGrid}`}>
            <div className={styles.indexIntro}>
              <h2 id="categorias-title">Explorar por categorías</h2>
              <p className={styles.sectionIntro}>
                El índice de la biblioteca: cada categoría con los títulos que tiene hoy en el catálogo.
              </p>
              <Link href="/categorias" className="link">
                Todas las categorías
              </Link>
            </div>
            <ul role="list" className={styles.index}>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link href={`/explorar?categoria=${category.slug}`} className={styles.indexRow}>
                    <span className={styles.indexName}>{category.name}</span>
                    <span className={styles.leader} aria-hidden="true" />
                    <span className={styles.indexCount}>
                      {category.bookCount}
                      <span className="visually-hidden"> {category.bookCount === 1 ? 'título' : 'títulos'}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ───────────── Disponibles ───────────── */}
      {available.length ? (
        <section className={styles.section} aria-labelledby="disponibles-title">
          <div className="container">
            <div className={styles.headRow}>
              <div>
                <h2 id="disponibles-title">Disponibles para préstamo</h2>
                <p className={styles.sectionIntro}>Están en la estantería ahora mismo. Pídelos y pasa a recogerlos.</p>
              </div>
              <Link href="/explorar?disponibilidad=disponible" className="link">
                Ver todos los disponibles
              </Link>
            </div>
            <ul role="list" className={styles.grid}>
              {available.map((book) => (
                <li key={book.id}>
                  <BookCard book={book} sizes="(max-width: 640px) 45vw, (max-width: 1100px) 30vw, 220px" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ───────────── Recomendación + ritmo de lectura ───────────── */}
      {pick ? (
        <section className={`${styles.editorial} on-ink`} aria-labelledby="editorial-title">
          <div className={`container ${styles.editorialGrid}`}>
            <div className={styles.editorialText}>
              <h2 id="editorial-title" className={styles.editorialTitle}>
                Para leer sin prisa
              </h2>
              {pick.editorialQuote ? (
                <figure className={styles.quote}>
                  <blockquote>
                    <p>«{pick.editorialQuote}»</p>
                  </blockquote>
                  <figcaption>
                    {joinAuthors(pick.authors)}, <cite>{pick.title}</cite>
                  </figcaption>
                </figure>
              ) : (
                <p className={styles.quote}>{pick.title}</p>
              )}
              {pick.editorialNote ? <p className={styles.editorialNote}>{truncate(pick.editorialNote, 360)}</p> : null}
              <div className={styles.editorialActions}>
                <Link href={`/libros/${pick.slug}`} className="btn btn--light">
                  Ver el libro
                </Link>
                <AvailabilityBadge available={pick.availableCopies} total={pick.totalCopies} />
              </div>
            </div>
            <div className={styles.editorialCalc}>
              <h3 className={styles.calcTitle}>¿Cuánto tardarías en leerlo?</h3>
              {pick.pageCount ? (
                <PaceCalculator
                  title={pick.title}
                  pageCount={pick.pageCount}
                  loanDays={LOAN_RULES.loanDays}
                  maxRenewals={LOAN_RULES.maxRenewals}
                  tone="ink"
                  defaultPages={25}
                />
              ) : (
                <p>Este libro aún no tiene el número de páginas en su ficha.</p>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* ───────────── Cómo funciona ───────────── */}
      <section className={styles.section} aria-labelledby="pasos-title">
        <div className="container">
          <div className={styles.headRow}>
            <div>
              <h2 id="pasos-title">Así funciona el préstamo</h2>
              <p className={styles.sectionIntro}>
                {LOAN_RULES.loanDays} días por libro, renovable {LOAN_RULES.maxRenewals} veces si nadie lo está esperando.
              </p>
            </div>
            <Link href="/como-funciona" className="link">
              Condiciones completas
            </Link>
          </div>
          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">1</span>
              <h3 className={styles.stepTitle}>Encuentra tu libro</h3>
              <p>Busca por título, autor o tema y mira si hay ejemplares en la estantería.</p>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">2</span>
              <h3 className={styles.stepTitle}>Pídelo desde tu cuenta</h3>
              <p>
                Si está prestado, resérvalo: te avisamos cuando vuelva y lo apartamos para ti.
              </p>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">3</span>
              <h3 className={styles.stepTitle}>Recógelo en el mostrador</h3>
              <p>Tienes {LOAN_RULES.pickupDays} días para pasar a buscarlo con tu carné de lector.</p>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNumber} aria-hidden="true">4</span>
              <h3 className={styles.stepTitle}>Léelo y devuélvelo</h3>
              <p>Consulta la fecha de devolución en tu cuenta y renuévalo desde allí si lo necesitas.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* ───────────── Invitación ───────────── */}
      <section className={styles.invite} aria-labelledby="invitacion-title">
        <div className={`container ${styles.inviteGrid}`}>
          {user ? (
            <div className={styles.inviteText}>
              <h2 id="invitacion-title">
                {activeLoans > 0
                  ? `Tienes ${activeLoans} ${activeLoans === 1 ? 'libro en curso' : 'libros en curso'}`
                  : 'Tu próxima lectura te espera'}
              </h2>
              <p className={styles.sectionIntro}>
                Consulta fechas de devolución, renueva y sigue tus reservas desde tu cuenta.
              </p>
              <div className={styles.heroActions}>
                <Link href="/cuenta" className="btn">
                  Ir a mis préstamos
                </Link>
                <Link href="/explorar" className="btn btn--ghost">
                  Seguir explorando
                </Link>
              </div>
            </div>
          ) : (
            <div className={styles.inviteText}>
              <h2 id="invitacion-title">Tu carné de lector, en dos minutos</h2>
              <p className={styles.sectionIntro}>
                Con una cuenta puedes pedir libros, reservar los que están prestados y ver cuándo te toca devolverlos.
              </p>
              <div className={styles.heroActions}>
                <Link href="/registro" className="btn">
                  Crear cuenta
                </Link>
                <Link href="/entrar" className="btn btn--ghost">
                  Ya tengo cuenta
                </Link>
              </div>
            </div>
          )}
          <figure className={styles.card} aria-label="Ejemplo de carné de lector">
            <div className={styles.cardTop}>
              <DropMark size={44} spine="var(--ink)" ink="var(--paper)" />
              <span>
                Biblioteca
                <br />
                <strong>Gota Gota</strong>
              </span>
            </div>
            <p className={styles.cardLabel}>Carné de lector</p>
            <p className={styles.cardName}>{user ? user.name : 'Tu nombre'}</p>
            <p className={styles.cardNumber}>{user ? user.cardNumber : 'GG-26-00000'}</p>
            <figcaption className="visually-hidden">
              {user ? 'Tu carné de lector' : 'Así se verá tu carné cuando crees tu cuenta'}
            </figcaption>
          </figure>
        </div>
      </section>
    </>
  )
}
