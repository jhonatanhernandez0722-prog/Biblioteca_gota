'use client'

import { IdCard, Trash2 } from 'lucide-react'
import { useActionState } from 'react'
import {
  addLoanCardAction,
  changePasswordAction,
  removeLoanCardAction,
  updateIdentityAction,
  updateProfileAction,
} from '@/actions/reader'
import { IdentityFields } from '@/components/auth/IdentityFields'
import { PasswordField, TextField } from '@/components/auth/PasswordField'
import { ConfirmAction } from '@/components/ui/ConfirmAction'
import { FormAlert } from '@/components/ui/FormFeedback'
import { SubmitButton } from '@/components/ui/SubmitButton'
import type { LoanCard } from '@/lib/types'

export function IdentityForm({ values, savedCard }: { values: Record<string, string>; savedCard: string | null }) {
  const [state, action] = useActionState(updateIdentityAction, null)
  return (
    <form action={action} className="form-stack" noValidate>
      <FormAlert state={state} />
      <IdentityFields errors={state?.fieldErrors} values={state?.values ?? values} savedCard={savedCard} hideLegend />
      <div>
        <SubmitButton className="btn" pendingLabel="Guardando…">
          Guardar datos
        </SubmitButton>
      </div>
    </form>
  )
}

/** Carnés de la cuenta: el principal (emitido por la biblioteca) y los que añada el lector. */
export function LoanCardsManager({ cards }: { cards: LoanCard[] }) {
  const [state, action] = useActionState(addLoanCardAction, null)
  return (
    <div className="form-stack">
      <ul role="list" style={{ display: 'grid', gap: 12 }}>
        {cards.map((card) => (
          <li key={card.id} style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <IdCard aria-hidden="true" width={20} height={20} />
              <span>
                <strong style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.03em' }}>{card.number}</strong>
                <span className="meta" style={{ display: 'block' }}>
                  {card.label}
                  {card.isPrimary ? ' · principal' : ''}
                </span>
              </span>
            </span>
            {card.isPrimary ? null : (
              <ConfirmAction
                action={removeLoanCardAction}
                hidden={{ cardId: card.id }}
                triggerLabel="Eliminar"
                triggerIcon={<Trash2 aria-hidden="true" />}
                triggerClassName="btn btn--ghost btn--sm"
                title={`¿Eliminar el carné ${card.number}?`}
                description={<p>Ya no aparecerá al pedir libros. Tus préstamos anteriores conservan el número.</p>}
                confirmLabel="Eliminar carné"
              />
            )}
          </li>
        ))}
      </ul>
      <form action={action} className="form-stack" noValidate>
        <FormAlert state={state} />
        <div className="form-grid">
          <TextField
            name="cardNumber"
            label="Número de carné"
            autoComplete="off"
            maxLength={24}
            defaultValue={state?.ok ? undefined : state?.values?.cardNumber}
            error={state?.fieldErrors?.cardNumber}
            hint="Letras, números y guiones."
          />
          <TextField
            name="label"
            label="Nombre (opcional)"
            autoComplete="off"
            required={false}
            maxLength={60}
            defaultValue={state?.ok ? undefined : state?.values?.label}
            hint="Por ejemplo: carné de la universidad."
          />
        </div>
        <div>
          <SubmitButton className="btn btn--secondary" pendingLabel="Guardando…">
            Añadir carné
          </SubmitButton>
        </div>
      </form>
    </div>
  )
}

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
