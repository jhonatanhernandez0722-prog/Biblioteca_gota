'use client'

import { useActionState, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import type { ActionState } from '@/lib/types'
import { FormAlert } from './FormFeedback'
import { toast } from './toast'

type ServerAction = (state: ActionState | null, formData: FormData) => Promise<ActionState>

/**
 * Las acciones suelen hacer desaparecer el botón que las lanzó (una solicitud aprobada
 * deja la lista). Por eso el resultado se avisa con el Toaster global, que siempre está
 * montado, y no con un efecto del propio botón.
 */
function useServerAction(action: ServerAction, onResult?: (result: ActionState) => void) {
  const [pending, startTransition] = useTransition()
  const run = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await action(null, data)
      onResult?.(result)
    })
  }
  return { pending, run }
}

/**
 * Acción que pide confirmación en un diálogo nativo (<dialog>): accesible por teclado,
 * con foco atrapado y cierre con Escape. Opcionalmente pide un motivo.
 */
export function ConfirmAction({
  action,
  hidden,
  triggerLabel,
  triggerIcon,
  triggerClassName = 'btn btn--secondary btn--sm',
  title,
  description,
  confirmLabel,
  confirmClassName = 'btn btn--danger',
  reason,
}: {
  action: ServerAction
  hidden: Record<string, string | number>
  triggerLabel: string
  triggerIcon?: ReactNode
  triggerClassName?: string
  title: string
  description: ReactNode
  confirmLabel: string
  confirmClassName?: string
  reason?: { label: string; placeholder?: string; hint?: string }
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const reasonId = useId()
  const [error, setError] = useState<ActionState | null>(null)
  const { pending, run } = useServerAction(action, (result) => {
    if (result.ok) {
      setError(null)
      dialog.current?.close()
      toast(result.message ?? 'Hecho.')
    } else {
      setError(result)
    }
  })

  return (
    <>
      <button
        type="button"
        className={triggerClassName}
        onClick={() => {
          setError(null)
          dialog.current?.showModal()
        }}
      >
        {triggerIcon}
        {triggerLabel}
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby={titleId}>
        <form onSubmit={run} className="dialog-body">
          <h2 id={titleId} className="dialog-title">
            {title}
          </h2>
          <div>{description}</div>
          {reason ? (
            <div className="field">
              <label htmlFor={reasonId}>{reason.label}</label>
              <textarea
                id={reasonId}
                name="reason"
                className="textarea"
                required
                minLength={5}
                maxLength={300}
                placeholder={reason.placeholder}
                style={{ minHeight: 96 }}
              />
              {reason.hint ? <p className="field-hint">{reason.hint}</p> : null}
            </div>
          ) : null}
          {Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {error ? <FormAlert state={error} /> : null}
          <div className="dialog-actions">
            <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className={confirmClassName} aria-disabled={pending} data-pending={pending} disabled={pending}>
              {pending ? <span className="spinner" aria-hidden="true" /> : null}
              {confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}

/**
 * Botón que ejecuta una server action sin confirmación y avisa del resultado.
 * Sin JavaScript, el formulario envía la misma acción de forma nativa.
 */
export function ActionButton({
  action,
  hidden,
  children,
  className = 'btn btn--sm',
  pendingLabel,
}: {
  action: ServerAction
  hidden: Record<string, string | number>
  children: ReactNode
  className?: string
  pendingLabel?: string
}) {
  const [, formAction] = useActionState(action, null)
  const { pending, run } = useServerAction(action, (result) => {
    if (result.message) toast(result.message, result.ok ? 'success' : 'warning')
  })
  return (
    <form action={formAction} onSubmit={run} style={{ display: 'inline-flex' }}>
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className={className} aria-disabled={pending} data-pending={pending} disabled={pending}>
        {pending ? <span className="spinner" aria-hidden="true" /> : null}
        {pending && pendingLabel ? pendingLabel : children}
      </button>
    </form>
  )
}
