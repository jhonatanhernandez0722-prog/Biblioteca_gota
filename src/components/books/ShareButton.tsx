'use client'

import { Share2 } from 'lucide-react'
import { toast } from '@/components/ui/toast'

/** Comparte con el menú nativo del dispositivo o, si no existe, copia el enlace. */
export function ShareButton({ title, text, path }: { title: string; text: string; path: string }) {
  const share = async () => {
    const url = new URL(path, window.location.origin).toString()
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url })
        return
      } catch (error) {
        if ((error as Error).name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast('Enlace copiado. Pégalo donde quieras compartirlo.')
    } catch {
      toast('No se pudo copiar el enlace. Cópialo desde la barra de direcciones.', 'warning')
    }
  }

  return (
    <button type="button" className="btn btn--secondary btn--sm" onClick={share}>
      <Share2 aria-hidden="true" />
      Compartir
    </button>
  )
}
