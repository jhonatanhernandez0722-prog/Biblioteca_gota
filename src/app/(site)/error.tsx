'use client'

import { RotateCcw } from 'lucide-react'
import Link from 'next/link'

/** Error de una página pública: dice qué pasó y ofrece cómo seguir. */
export default function SiteError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container" style={{ padding: '64px 0' }}>
      <div className="empty" role="alert">
        <h1 style={{ fontSize: 'var(--fs-h2)' }}>No se pudo cargar esta página</h1>
        <p>
          Algo falló en el servidor al preparar la información. Vuelve a intentarlo; si el problema sigue, escríbenos
          desde la página de contacto.
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn" onClick={reset}>
            <RotateCcw aria-hidden="true" />
            Reintentar
          </button>
          <Link href="/" className="btn btn--ghost">
            Ir al inicio
          </Link>
        </div>
      </div>
    </div>
  )
}
