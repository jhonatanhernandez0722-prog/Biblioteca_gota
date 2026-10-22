'use client'

import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TOAST_EVENT, type ToastDetail } from './toast'

const FLASH_COOKIE = 'gg_flash'

interface Item extends ToastDetail {
  id: number
}

function readFlash(): ToastDetail | null {
  const raw = document.cookie.split('; ').find((c) => c.startsWith(`${FLASH_COOKIE}=`))
  if (!raw) return null
  document.cookie = `${FLASH_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`
  try {
    const value = JSON.parse(decodeURIComponent(raw.slice(FLASH_COOKIE.length + 1)))
    if (typeof value?.message === 'string') return { message: value.message, tone: value.tone ?? 'success' }
  } catch {
    // Cookie dañada: se ignora.
  }
  return null
}

/** Región de avisos: confirma lo que acaba de pasar y desaparece sola. */
export function Toaster() {
  const [items, setItems] = useState<Item[]>([])
  const nextId = useRef(1)
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const push = useCallback((detail: ToastDetail) => {
    const id = nextId.current++
    setItems((current) => [...current.slice(-2), { ...detail, id }])
    window.setTimeout(() => setItems((current) => current.filter((t) => t.id !== id)), 6000)
  }, [])

  useEffect(() => {
    const onToast = (event: Event) => push((event as CustomEvent<ToastDetail>).detail)
    window.addEventListener(TOAST_EVENT, onToast)
    return () => window.removeEventListener(TOAST_EVENT, onToast)
  }, [push])

  // Los avisos que llegan tras una redirección viajan en una cookie de un solo uso.
  useEffect(() => {
    const flash = readFlash()
    if (flash) push(flash)
  }, [pathname, searchParams, push])

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {items.map((item) => {
        const Icon = item.tone === 'warning' ? TriangleAlert : item.tone === 'info' ? Info : CircleCheck
        return (
          <div key={item.id} className="toast">
            <Icon aria-hidden="true" />
            <span>{item.message}</span>
            <button
              type="button"
              aria-label="Cerrar aviso"
              onClick={() => setItems((current) => current.filter((t) => t.id !== item.id))}
            >
              <X aria-hidden="true" width={16} height={16} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
