import { TriangleAlert } from 'lucide-react'
import { isDemoMode } from '@/server/site'

/** Marca los textos legales de ejemplo mientras la biblioteca no los haya revisado. */
export function DraftNotice({ className }: { className?: string }) {
  if (!isDemoMode()) return null
  return (
    <div className={`alert alert--warning ${className ?? ''}`} role="note">
      <TriangleAlert aria-hidden="true" />
      <p>
        <strong>Borrador para revisar.</strong> Este texto describe cómo funciona la aplicación, pero la biblioteca debe
        revisarlo con su asesoría legal antes de publicarlo.
      </p>
    </div>
  )
}
