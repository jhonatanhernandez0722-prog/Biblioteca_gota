'use client'

import { useActionState } from 'react'
import { changePasswordAction, updateProfileAction } from '@/actions/reader'
import { PasswordField, TextField } from '@/components/auth/PasswordField'
import { FormAlert } from '@/components/ui/FormFeedback'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function ProfileForm({ name }: { name: string }) {
  const [state, action] = useActionState(updateProfileAction, null)
  return (
    <form action={action} className="form-stack" noValidate>
      <FormAlert state={state} />
      <TextField
        name="name"
        label="Nombre y apellido"
        autoComplete="name"
        maxLength={80}
        defaultValue={name}
        error={state?.fieldErrors?.name}
      />
      <div>
        <SubmitButton className="btn" pendingLabel="Guardando…">
          Guardar cambios
        </SubmitButton>
      </div>
    </form>
  )
}

export function ChangePasswordForm() {
  const [state, action] = useActionState(changePasswordAction, null)
  return (
    <form action={action} className="form-stack" noValidate>
      <FormAlert state={state} />
      <PasswordField
        name="currentPassword"
        label="Contraseña actual"
        autoComplete="current-password"
        error={state?.fieldErrors?.currentPassword}
      />
      <PasswordField
        name="password"
        label="Contraseña nueva"
        autoComplete="new-password"
        minLength={10}
        hint="Al menos 10 caracteres."
        error={state?.fieldErrors?.password}
      />
      <PasswordField
        name="confirm"
        label="Repite la contraseña nueva"
        autoComplete="new-password"
        error={state?.fieldErrors?.confirm}
      />
      <div>
        <SubmitButton className="btn btn--secondary" pendingLabel="Cambiando…">
          Cambiar contraseña
        </SubmitButton>
      </div>
    </form>
  )
}
