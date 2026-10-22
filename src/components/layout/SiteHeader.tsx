import Link from 'next/link'
import { Search } from 'lucide-react'
import { Logo } from '@/components/brand/Logo'
import { isStaff } from '@/lib/status'
import type { SessionUser } from '@/lib/types'
import { MobileMenu } from './MobileMenu'
import { NavLinks } from './NavLinks'
import { UserMenu } from './UserMenu'
import styles from './SiteHeader.module.css'

export const NAV_ITEMS = [
  { href: '/', label: 'Inicio' },
  { href: '/explorar', label: 'Explorar libros' },
  { href: '/categorias', label: 'Categorías' },
  { href: '/como-funciona', label: 'Cómo funciona' },
]

export function SiteHeader({ user }: { user: SessionUser | null }) {
  return (
    <header className={styles.header}>
      <div className={`container ${styles.bar}`}>
        <Logo />
        <nav className={styles.nav} aria-label="Principal">
          <NavLinks items={NAV_ITEMS} />
        </nav>
        <div className={styles.actions}>
          <Link href="/explorar" className={styles.iconLink} aria-label="Buscar en el catálogo">
            <Search aria-hidden="true" />
          </Link>
          {user ? (
            <UserMenu name={user.name} email={user.email} staff={isStaff(user.role)} />
          ) : (
            <>
              <Link href="/registro" className={styles.textLink}>
                Crear cuenta
              </Link>
              <Link href="/entrar" className="btn btn--sm">
                Entrar
              </Link>
            </>
          )}
        </div>
        <MobileMenu items={NAV_ITEMS} user={user ? { name: user.name, staff: isStaff(user.role) } : null} />
      </div>
    </header>
  )
}
