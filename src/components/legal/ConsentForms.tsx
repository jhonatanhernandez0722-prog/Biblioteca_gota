'use client'

import { useActionState } from 'react'
import { acceptPendingConsentsAction, revokePrivacyAction } from '@/actions/legal'
import { FormAlert } from '@/components/ui/FormFeedback'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { ConsentCheckboxes } from './ConsentCheckboxes'

export function AcceptPendingForm({ pending }: { pending: ('terminos' | 'privacidad')[] }) {
  const [state, action] = useActionState(acceptPendingConsentsAction, null)
  if (state?.ok) return <FormAlert state={state} />
  return (
    <form action={action} className="form-stack" noValidate>
      <FormAlert state={state} />
      <ConsentCheckboxes only={pending} errors={state?.fieldErrors} />
      <div>
        <SubmitButton className="btn">Registrar mi aceptación</SubmitButton>
      </div>
    </form>
  )
}

export function RevokePrivacyForm() {
  const [state, action] = useActionState(revokePrivacyAction, null)
  return (
    <form action={action} className="form-stack">
      <FormAlert state={state} />
      {!state?.ok ? (
        <>
          <label className="check">
            <input type="checkbox" name="confirm" required />
            Entiendo que, sin esta autorización, no podré pedir ni reservar libros.
          </label>
          <div>
            <SubmitButton className="btn btn--danger-ghost btn--sm">Revocar la autorización</SubmitButton>
          </div>
        </>
      ) : null}
    </form>
  )
}
