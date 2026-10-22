'use client'

import type { ReactNode } from 'react'
import { useFormStatus } from 'react-dom'

/** Botón de envío con estado de carga. Mantiene su ancho y anuncia el progreso. */
export function SubmitButton({
  children,
  pendingLabel,
  className = 'btn',
  disabled,
  name,
  value,
}: {
  children: ReactNode
  pendingLabel?: string
  className?: string
  disabled?: boolean
  name?: string
  value?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      aria-disabled={pending || disabled}
      data-pending={pending}
      name={name}
      value={value}
      onClick={(event) => {
        if (pending) event.preventDefault()
      }}
    >
      {pending ? <span className="spinner" aria-hidden="true" /> : null}
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  )
}
