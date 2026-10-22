'use client'

import { BookMarked, ChevronDown, LayoutDashboard, LogOut, UserRound } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { logoutAction } from '@/actions/auth'
import styles from './UserMenu.module.css'

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase()
}

/** Menú de cuenta (patrón de divulgación: botón + lista de enlaces). */
export function UserMenu({ name, email, staff }: { name: string; email: string; staff: boolean }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const pathname = usePathname()
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
    }
    const onClick = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div className={styles.root} ref={root}>
      <button
        ref={button}
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initials(name)}
        </span>
        <span className={styles.name}>Mi cuenta</span>
        <ChevronDown aria-hidden="true" className={styles.chevron} />
      </button>
      <div id={panelId} className={styles.panel} hidden={!open}>
        <p className={styles.who}>
          <strong>{name}</strong>
          <span>{email}</span>
        </p>
        <ul role="list" className={styles.list}>
          <li>
            <Link href="/cuenta" className={styles.item}>
              <BookMarked aria-hidden="true" />
              Mis préstamos
            </Link>
          </li>
          <li>
            <Link href="/cuenta/perfil" className={styles.item}>
              <UserRound aria-hidden="true" />
              Mi perfil
            </Link>
          </li>
          {staff ? (
            <li>
              <Link href="/admin" className={styles.item}>
                <LayoutDashboard aria-hidden="true" />
                Panel de gestión
              </Link>
            </li>
          ) : null}
          <li>
            <form action={logoutAction}>
              <button type="submit" className={styles.item}>
                <LogOut aria-hidden="true" />
                Cerrar sesión
              </button>
            </form>
          </li>
        </ul>
      </div>
    </div>
  )
}
