'use client'

import { useState, type ComponentProps } from 'react'

/**
 * Un <select> que sigue el valor que llega del servidor. Con la búsqueda en tiempo real la
 * página se vuelve a pintar sin recargar, y un <select> con `defaultValue` se quedaría
 * mostrando la opción anterior (por ejemplo «Título» cuando ya se ordena por relevancia).
 * No se remonta: el foco del teclado se conserva.
 */
export function SyncedSelect({ value, ...props }: Omit<ComponentProps<'select'>, 'value' | 'defaultValue' | 'onChange'> & { value: string }) {
  const [current, setCurrent] = useState(value)
  const [received, setReceived] = useState(value)
  if (value !== received) {
    setReceived(value)
    setCurrent(value)
  }
  return <select {...props} value={current} onChange={(e) => setCurrent(e.target.value)} />
}
