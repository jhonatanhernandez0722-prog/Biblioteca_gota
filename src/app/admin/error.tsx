'use client'

import { RotateCcw } from 'lucide-react'
import Link from 'next/link'

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="empty" role="alert">
      <h1 style={{ fontSize: 'var(--fs-h2)' }}>No se pudo cargar esta pantalla</h1>
      <p>Algo falló en el servidor. Tus datos no se han modificado. Vuelve a intentarlo o ve al resumen.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn" onClick={reset}>
          <RotateCcw aria-hidden="true" />
          Reintentar
        </button>
        <Link href="/admin" className="btn btn--ghost">
          Ir al resumen
        </Link>
      </div>
    </div>
  )
}
