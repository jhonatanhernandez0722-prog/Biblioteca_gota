'use client'

import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { logoutAction } from '@/actions/auth'
import { NavLinks } from './NavLinks'
import styles from './MobileMenu.module.css'

/** Menú compacto para pantallas pequeñas: panel a pantalla completa, cierre con Escape. */
export function MobileMenu({
  items,
  user,
}: {
  items: { href: string; label: string }[]
  user: { name: string; staff: boolean } | null
}) {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const pathname = usePathname()
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        button.current?.focus()
      }
      if (event.key === 'Tab' && panel.current) {
        const focusable = panel.current.querySelectorAll<HTMLElement>('a, button')
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={styles.root}>
      <button
        ref={button}
        type="button"
        className={styles.toggle}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        <span>{open ? 'Cerrar' : 'Menú'}</span>
      </button>
      <div id={panelId} ref={panel} className={styles.panel} hidden={!open}>
        <nav aria-label="Principal (móvil)">
          <NavLinks items={items} variant="stack" onNavigate={() => setOpen(false)} />
        </nav>
        <div className={styles.account}>
          {user ? (
            <>
              <p className={styles.hello}>Sesión de {user.name}</p>
              <Link href="/cuenta" className="btn btn--block">
                Mis préstamos
              </Link>
              <Link href="/cuenta/perfil" className="btn btn--secondary btn--block">
                Mi perfil
              </Link>
              {user.staff ? (
                <Link href="/admin" className="btn btn--secondary btn--block">
                  Panel de gestión
                </Link>
              ) : null}
              <form action={logoutAction}>
                <button type="submit" className="btn btn--ghost btn--block">
                  Cerrar sesión
                </button>
              </form>
            </>
          ) : (
            <>
              <Link href="/entrar" className="btn btn--block">
                Entrar
              </Link>
              <Link href="/registro" className="btn btn--secondary btn--block">
                Crear cuenta
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
