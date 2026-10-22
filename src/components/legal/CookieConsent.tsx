'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from '@/components/ui/toast'
import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE,
  COOKIE_CATEGORIES,
  isAllowed,
  OPTIONAL_IN_USE,
  parseChoice,
  serializeChoice,
  type CookieChoice,
  type OptionalCategory,
} from '@/lib/cookie-consent'

const EVENT = 'gg:cookie-consent'

function readChoice(): CookieChoice | null {
  const raw = document.cookie.split('; ').find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
  return parseChoice(raw?.slice(CONSENT_COOKIE.length + 1))
}

function saveChoice(choice: Omit<CookieChoice, 'v' | 'at'>) {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${CONSENT_COOKIE}=${serializeChoice(choice)}; Max-Age=${CONSENT_MAX_AGE}; Path=/; SameSite=Lax${secure}`
  window.dispatchEvent(new Event(EVENT))
}

function useChoice() {
  const [choice, setChoice] = useState<CookieChoice | null | undefined>(undefined)
  useEffect(() => {
    const update = () => setChoice(readChoice())
    update()
    window.addEventListener(EVENT, update)
    return () => window.removeEventListener(EVENT, update)
  }, [])
  return choice
}

/** Único punto de entrada para cualquier script o recurso opcional: no se monta sin consentimiento. */
export function ConsentGate({ category, children }: { category: OptionalCategory; children: ReactNode }) {
  const choice = useChoice()
  if (choice === undefined || !isAllowed(choice, category)) return null
  return <>{children}</>
}

/** Panel de preferencias: aceptar, rechazar, configurar por categoría y retirar. */
export function CookiePreferences() {
  const choice = useChoice()
  const [draft, setDraft] = useState({ preferences: false, analytics: false, advertising: false })
  const [synced, setSynced] = useState<CookieChoice | null | undefined>(undefined)
  if (choice !== synced) {
    setSynced(choice)
    if (choice) setDraft({ preferences: choice.preferences, analytics: choice.analytics, advertising: choice.advertising })
  }

  const save = (value: typeof draft, message: string) => {
    saveChoice(value)
    toast(message)
  }

  return (
    <section aria-labelledby="preferencias-cookies" style={{ display: 'grid', gap: 16 }}>
      <h2 id="preferencias-cookies">Preferencias de cookies</h2>
      <p>
        {choice
          ? `Tu elección actual se guardó el ${new Date(choice.at).toLocaleDateString('es-CO')}.`
          : 'Todavía no has elegido: mientras tanto, ninguna cookie opcional está activa.'}
      </p>
      <ul role="list" style={{ display: 'grid', gap: 12 }}>
        {COOKIE_CATEGORIES.map((cat) => (
          <li key={cat.id} className="alert" style={{ alignItems: 'center' }}>
            <label className="check" style={{ flex: 1 }}>
              <input
                type="checkbox"
                checked={cat.id === 'necessary' ? true : draft[cat.id]}
                disabled={cat.id === 'necessary'}
                onChange={(e) => cat.id !== 'necessary' && setDraft((d) => ({ ...d, [cat.id]: e.target.checked }))}
              />
              <span>
                <strong>{cat.label}</strong>
                <br />
                {cat.description}
                {cat.id !== 'necessary' && !cat.inUse ? ' No se usa actualmente.' : ''}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <button type="button" className="btn" onClick={() => save(draft, 'Preferencias guardadas.')}>
          Guardar mi selección
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => save({ preferences: true, analytics: true, advertising: true }, 'Cookies opcionales aceptadas.')}
        >
          Aceptar todas
        </button>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => save({ preferences: false, analytics: false, advertising: false }, 'Cookies opcionales rechazadas.')}
        >
          Rechazar las opcionales
        </button>
      </div>
      <p className="meta">
        Puedes cambiar o retirar tu consentimiento aquí en cualquier momento. Retirarlo desactiva al instante cualquier
        contenido opcional.
      </p>
    </section>
  )
}

/** Aviso inicial: solo aparece si hay alguna categoría opcional en uso y aún no se ha elegido. */
export function CookieBanner() {
  const choice = useChoice()
  if (!OPTIONAL_IN_USE || choice !== null) return null
  return (
    <div role="region" aria-label="Aviso de cookies" className="toast" style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 95, maxWidth: 520 }}>
      <span>
        Usamos cookies técnicas y, si lo aceptas, otras opcionales. <Link href="/cookies">Configurar</Link>
      </span>
      <button type="button" onClick={() => saveChoice({ preferences: false, analytics: false, advertising: false })}>
        Rechazar
      </button>
    </div>
  )
}
