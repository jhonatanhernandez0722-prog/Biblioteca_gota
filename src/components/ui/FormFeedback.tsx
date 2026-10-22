import { CircleAlert, CircleCheck } from 'lucide-react'
import type { ActionState } from '@/lib/types'

/** Mensaje general de un formulario tras enviarlo. */
export function FormAlert({ state }: { state: ActionState | null | undefined }) {
  if (!state?.message) return null
  return (
    <div className={`alert ${state.ok ? 'alert--success' : 'alert--danger'}`} role={state.ok ? 'status' : 'alert'}>
      {state.ok ? <CircleCheck aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      <p>{state.message}</p>
    </div>
  )
}

/** Error de un campo concreto, enlazado con aria-describedby desde el input. */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="field-error">
      <CircleAlert aria-hidden="true" />
      {message}
    </p>
  )
}
