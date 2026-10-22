'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import styles from './NavLinks.module.css'

export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function NavLinks({
  items,
  variant = 'bar',
  onNavigate,
}: {
  items: { href: string; label: string }[]
  variant?: 'bar' | 'stack'
  onNavigate?: () => void
}) {
  const pathname = usePathname()
  return (
    <ul role="list" className={variant === 'bar' ? styles.bar : styles.stack}>
      {items.map((item) => {
        const active = isActivePath(pathname, item.href)
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              className={styles.link}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
            >
              {item.label}
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
