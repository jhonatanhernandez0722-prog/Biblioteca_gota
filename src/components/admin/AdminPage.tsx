import Link from 'next/link'
import type { ReactNode } from 'react'
import styles from './AdminPage.module.css'

/** Cabecera común de las pantallas del panel: título, contexto y acciones. */
export function AdminHeader({
  title,
  description,
  actions,
  back,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
  back?: { href: string; label: string }
}) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {back ? (
          <Link href={back.href} className={styles.back}>
            {back.label}
          </Link>
        ) : null}
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  )
}

/** Panel blanco con título: la unidad de las pantallas de trabajo. */
export function Panel({
  title,
  description,
  actions,
  children,
  id,
}: {
  title?: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  id?: string
}) {
  return (
    <section className={styles.panel} aria-labelledby={title && id ? `${id}-title` : undefined} id={id}>
      {title ? (
        <div className={styles.panelHead}>
          <div>
            <h2 id={id ? `${id}-title` : undefined} className={styles.panelTitle}>
              {title}
            </h2>
            {description ? <p className={styles.panelDescription}>{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  )
}

/** Pestañas como enlaces: cada vista tiene su URL. */
export function TabLinks({
  tabs,
  current,
  label,
}: {
  tabs: { key: string; label: string; href: string; count?: number; tone?: 'danger' }[]
  current: string
  label: string
}) {
  return (
    <nav aria-label={label} className={styles.tabs}>
      <ul role="list">
        {tabs.map((tab) => (
          <li key={tab.key}>
            <Link href={tab.href} className={styles.tab} aria-current={tab.key === current ? 'page' : undefined}>
              {tab.label}
              {tab.count !== undefined ? (
                <span className={`${styles.tabCount} ${tab.tone === 'danger' && tab.count > 0 ? styles.tabDanger : ''}`}>
                  {tab.count}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
