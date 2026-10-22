'use client'

import {
  BookCheck,
  ExternalLink,
  History,
  Import,
  LayoutDashboard,
  Library,
  LogOut,
  Menu,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { logoutAction } from '@/actions/auth'
import { DropMark } from '@/components/brand/DropMark'
import styles from './AdminNav.module.css'

const ITEMS = [
  { href: '/admin', label: 'Resumen', icon: LayoutDashboard, match: (p: string) => p === '/admin' },
  {
    href: '/admin/libros',
    label: 'Libros',
    icon: Library,
    match: (p: string) => p.startsWith('/admin/libros') && !p.startsWith('/admin/libros/importar'),
  },
  { href: '/admin/libros/importar', label: 'Importar libro', icon: Import, match: (p: string) => p.startsWith('/admin/libros/importar') },
  { href: '/admin/prestamos', label: 'Préstamos', icon: BookCheck, match: (p: string) => p.startsWith('/admin/prestamos') },
  { href: '/admin/usuarios', label: 'Usuarios', icon: Users, match: (p: string) => p.startsWith('/admin/usuarios') },
  { href: '/admin/actividad', label: 'Actividad', icon: History, match: (p: string) => p.startsWith('/admin/actividad') },
  {
    href: '/admin/consentimientos',
    label: 'Consentimientos',
    icon: ShieldCheck,
    match: (p: string) => p.startsWith('/admin/consentimientos'),
    adminOnly: true,
  },
]

export function AdminNav({
  user,
  attention,
}: {
  user: { name: string; role: string; isAdmin: boolean }
  attention: number
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpen(false)
  }

  return (
    <aside className={`${styles.sidebar} on-ink`} data-open={open}>
      <div className={styles.top}>
        <Link href="/admin" className={styles.brand}>
          <DropMark size={32} spine="var(--ink)" ink="var(--paper)" />
          <span>
            <span className={styles.brandSmall}>Gota Gota</span>
            <span className={styles.brandName}>Panel</span>
          </span>
        </Link>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls="admin-menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          <span>{open ? 'Cerrar' : 'Menú'}</span>
        </button>
      </div>
      <div id="admin-menu" className={styles.menu}>
        <nav aria-label="Panel de gestión">
          <ul role="list" className={styles.list}>
            {ITEMS.filter((item) => !('adminOnly' in item) || user.isAdmin).map((item) => {
              const active = item.match(pathname)
              const Icon = item.icon
              return (
                <li key={item.href}>
                  <Link href={item.href} className={styles.link} aria-current={active ? 'page' : undefined}>
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.href === '/admin/prestamos' && attention > 0 ? (
                      <span className={styles.count} aria-label={`${attention} requieren atención`}>
                        {attention}
                      </span>
                    ) : null}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className={styles.footer}>
          <Link href="/" className={styles.link}>
            <ExternalLink aria-hidden="true" />
            <span>Ver la biblioteca</span>
          </Link>
          <div className={styles.user}>
            <p className={styles.userName}>{user.name}</p>
            <p className={styles.userRole}>{user.role}</p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className={styles.link}>
              <LogOut aria-hidden="true" />
              <span>Cerrar sesión</span>
            </button>
          </form>
        </div>
      </div>
    </aside>
  )
}
