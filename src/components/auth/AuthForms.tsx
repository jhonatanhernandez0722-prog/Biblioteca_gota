'use client'

import Link from 'next/link'
import { useActionState, useRef } from 'react'
import {
  forgotPasswordAction,
  loginAction,
  registerAction,
  resetPasswordAction,
} from '@/actions/auth'
import { ConsentCheckboxes } from '@/components/legal/ConsentCheckboxes'
import { FormAlert } from '@/components/ui/FormFeedback'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { PasswordField, TextField } from './PasswordField'
import styles from './AuthForms.module.css'

export interface DemoAccount {
  label: string
  email: string
  password: string
}

export function LoginForm({ next, demoAccounts }: { next?: string; demoAccounts?: DemoAccount[] }) {
  const [state, action] = useActionState(loginAction, null)
  const form = useRef<HTMLFormElement>(null)

  const fill = (account: DemoAccount) => {
    const el = form.current
    if (!el) return
    ;(el.elements.namedItem('email') as HTMLInputElement).value = account.email
    ;(el.elements.namedItem('password') as HTMLInputElement).value = account.password
    ;(el.querySelector('button[type="submit"]') as HTMLButtonElement | null)?.focus()
  }

  return (
    <>
      <form ref={form} action={action} className="form-stack" noValidate>
        <FormAlert state={state} />
        <TextField
          name="email"
          label="Correo electrónico"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={160}
          defaultValue={state?.values?.email}
          error={state?.fieldErrors?.email}
        />
        <PasswordField
          name="password"
          label="Contraseña"
          autoComplete="current-password"
          error={state?.fieldErrors?.password}
          labelAside={
            <Link href="/recuperar" className={styles.aside}>
              ¿La olvidaste?
            </Link>
          }
        />
        {next ? <input type="hidden" name="siguiente" value={next} /> : null}
        <SubmitButton className="btn btn--block" pendingLabel="Entrando…">
          Entrar
        </SubmitButton>
      </form>
      {demoAccounts?.length ? (
        <section className={styles.demo} aria-labelledby="cuentas-demo">
          <h2 id="cuentas-demo" className={styles.demoTitle}>
            Cuentas de demostración
          </h2>
          <p className={styles.demoText}>Rellenan el formulario con una cuenta de prueba de cada perfil.</p>
          <div className={styles.demoButtons}>
            {demoAccounts.map((account) => (
              <button key={account.email} type="button" className="btn btn--secondary btn--sm" onClick={() => fill(account)}>
                {account.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </>
  )
}

export function RegisterForm({ next }: { next?: string }) {
  const [state, action] = useActionState(registerAction, null)
  return (
    <form action={action} className="form-stack" noValidate>
      <FormAlert state={state} />
      <TextField
        name="name"
        label="Nombre y apellido"
        autoComplete="name"
        maxLength={80}
        defaultValue={state?.values?.name}
        error={state?.fieldErrors?.name}
      />
      <TextField
        name="email"
        label="Correo electrónico"
        type="email"
        inputMode="email"
        autoComplete="email"
        maxLength={160}
        defaultValue={state?.values?.email}
        error={state?.fieldErrors?.email}
        hint="Te escribiremos aquí cuando un libro esté listo para recoger."
      />
      <PasswordField
        name="password"
        label="Contraseña"
        autoComplete="new-password"
        minLength={10}
        error={state?.fieldErrors?.password}
        hint="Al menos 10 caracteres. Una frase fácil de recordar funciona bien."
      />
      <PasswordField
        name="confirm"
        label="Repite la contraseña"
        autoComplete="new-password"
        error={state?.fieldErrors?.confirm}
      />
      <ConsentCheckboxes errors={state?.fieldErrors} />
      {next ? <input type="hidden" name="siguiente" value={next} /> : null}
      <SubmitButton className="btn btn--block" pendingLabel="Creando tu cuenta…">
        Crear cuenta
      </SubmitButton>
    </form>
  )
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(forgotPasswordAction, null)
  if (state?.ok) {
    return (
      <div className="form-stack">
        <FormAlert state={state} />
        <p>
          Revisa también la carpeta de correo no deseado. ¿No llegó?{' '}
          <Link href="/recuperar" className="link">
            Pide otro enlace
          </Link>
          .
        </p>
        <Link href="/entrar" className="btn btn--secondary btn--block">
          Volver a entrar
        </Link>
      </div>
    )
  }
  return (
    <form action={action} className="form-stack" noValidate>
      <FormAlert state={state} />
      <TextField
        name="email"
        label="Correo de tu cuenta"
        type="email"
        inputMode="email"
        autoComplete="email"
        maxLength={160}
        defaultValue={state?.values?.email}
        error={state?.fieldErrors?.email}
      />
      <SubmitButton className="btn btn--block" pendingLabel="Enviando…">
        Enviar enlace
      </SubmitButton>
    </form>
  )
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, null)
  return (
    <form action={action} className="form-stack" noValidate>
      <FormAlert state={state} />
      <input type="hidden" name="token" value={token} />
      <PasswordField
        name="password"
        label="Contraseña nueva"
        autoComplete="new-password"
        minLength={10}
        error={state?.fieldErrors?.password}
        hint="Al menos 10 caracteres."
      />
      <PasswordField
        name="confirm"
        label="Repite la contraseña"
        autoComplete="new-password"
        error={state?.fieldErrors?.confirm}
      />
      <SubmitButton className="btn btn--block" pendingLabel="Guardando…">
        Guardar contraseña
      </SubmitButton>
    </form>
  )
}
