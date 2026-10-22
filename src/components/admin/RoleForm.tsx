'use client'

import { useActionState, useEffect, useId } from 'react'
import { setUserRoleAction } from '@/actions/admin'
import { FormAlert } from '@/components/ui/FormFeedback'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { toast } from '@/components/ui/toast'
import type { Role } from '@/lib/types'

/** Cambio de rol (solo administración). El servidor vuelve a comprobar el permiso. */
export function RoleForm({ userId, role }: { userId: number; role: Role }) {
  const uid = useId()
  const [state, action] = useActionState(setUserRoleAction, null)
  useEffect(() => {
    if (state?.ok && state.message) toast(state.message)
  }, [state])
  return (
    <form action={action} style={{ display: 'grid', gap: 12 }}>
      <input type="hidden" name="userId" value={userId} />
      {state && !state.ok ? <FormAlert state={state} /> : null}
      <div className="field">
        <label htmlFor={`${uid}-role`}>Perfil</label>
        <select id={`${uid}-role`} name="role" className="select" defaultValue={role}>
          <option value="reader">Lector: pide y reserva libros</option>
          <option value="librarian">Bibliotecario: gestiona catálogo y préstamos</option>
          <option value="admin">Administración: además, usuarios y permisos</option>
        </select>
      </div>
      <div>
        <SubmitButton className="btn btn--secondary btn--sm">Guardar perfil</SubmitButton>
      </div>
    </form>
  )
}
