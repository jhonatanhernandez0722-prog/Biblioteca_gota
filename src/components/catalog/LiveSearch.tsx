'use client'

import { Search } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'

/** Espera tras la última tecla antes de buscar: rápido para el lector, ligero para el servidor. */
const DEBOUNCE_MS = 250

/**
 * Búsqueda en tiempo real: mientras se escribe, actualiza la URL del formulario sin
 * recargar ni perder el foco, y la página (resultados, contadores, paginación) se vuelve
 * a pintar en el servidor. Las consultas repetidas las sirve la caché del buscador.
 * Sin JavaScript sigue siendo un formulario normal que se envía con Intro.
 */
export function LiveSearch({
  formId,
  defaultValue,
  placeholder,
  label,
  className,
  iconClassName,
}: {
  formId: string
  defaultValue: string
  placeholder: string
  label: string
  className?: string
  iconClassName?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [pending, startTransition] = useTransition()
  const [value, setValue] = useState(defaultValue)
  const timer = useRef<number | undefined>(undefined)
  const [sent, setSent] = useState(defaultValue.trim())
  const [prevDefault, setPrevDefault] = useState(defaultValue)

  // Si la URL cambia por otra vía (un enlace, «Quitar todos»), el campo la sigue. Si es
  // la respuesta a lo que se acaba de teclear, no se toca: el lector puede seguir escribiendo.
  if (defaultValue !== prevDefault) {
    setPrevDefault(defaultValue)
    if (defaultValue.trim() !== sent) {
      setValue(defaultValue)
      setSent(defaultValue.trim())
    }
  }

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const search = (next: string) => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form || next.trim() === sent) return
    setSent(next.trim())
    const params = new URLSearchParams()
    // La ordenación solo viaja si el lector la eligió; si no, con texto se ordena por relevancia.
    const chosenSort = new URLSearchParams(window.location.search).has('orden')
    for (const [key, raw] of new FormData(form)) {
      const v = String(raw).trim()
      // Una búsqueda nueva empieza en la primera página.
      if (!v || key === 'pagina' || (key === 'orden' && !chosenSort)) continue
      params.set(key, key === 'q' ? next.trim() : v)
    }
    if (!next.trim()) params.delete('q')
    const qs = params.toString()
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  return (
    <div className={className} data-pending={pending || undefined}>
      <label htmlFor="q" className="visually-hidden">
        {label}
      </label>
      <Search aria-hidden="true" className={iconClassName} />
      <input
        id="q"
        name="q"
        type="search"
        value={value}
        onChange={(e) => {
          const next = e.target.value.slice(0, 120)
          setValue(next)
          window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => search(next), DEBOUNCE_MS)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            window.clearTimeout(timer.current)
            search(value)
          }
        }}
        className="input"
        placeholder={placeholder}
        autoComplete="off"
        enterKeyHint="search"
        maxLength={120}
        aria-describedby="resultados"
      />
      {pending ? (
        <span className="spinner" aria-hidden="true" style={{ position: 'absolute', right: 16, top: '50%', translate: '0 -50%' }} />
      ) : null}
    </div>
  )
}
