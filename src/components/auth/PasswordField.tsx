'use client'

import { Eye, EyeOff } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { FieldError } from '@/components/ui/FormFeedback'

/** Contraseña con botón para mostrarla: reduce errores al escribirla en el móvil. */
export function PasswordField({
  name,
  label,
  autoComplete,
  error,
  hint,
  labelAside,
  minLength,
}: {
  name: string
  label: string
  autoComplete: 'current-password' | 'new-password'
  error?: string
  hint?: string
  labelAside?: ReactNode
  minLength?: number
}) {
  const id = useId()
  const [visible, setVisible] = useState(false)
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className="field" data-invalid={Boolean(error)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <label htmlFor={id}>{label}</label>
        {labelAside}
      </div>
      <div className="input-with-action">
        <input
          id={id}
          name={name}
          type={visible ? 'text' : 'password'}
          className="input"
          autoComplete={autoComplete}
          required
          minLength={minLength}
          maxLength={128}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff aria-hidden="true" width={20} height={20} /> : <Eye aria-hidden="true" width={20} height={20} />}
        </button>
      </div>
      {hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  )
}

/** Campo de texto con etiqueta, ayuda y error enlazados (accesible). */
export function TextField({
  name,
  label,
  type = 'text',
  autoComplete,
  error,
  hint,
  defaultValue,
  required = true,
  maxLength,
  inputMode,
}: {
  name: string
  label: string
  type?: 'text' | 'email'
  autoComplete?: string
  error?: string
  hint?: string
  defaultValue?: string
  required?: boolean
  maxLength?: number
  inputMode?: 'email' | 'text'
}) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
  return (
    <div className="field" data-invalid={Boolean(error)}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        className="input"
        autoComplete={autoComplete}
        required={required}
        defaultValue={defaultValue}
        maxLength={maxLength}
        inputMode={inputMode}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy}
      />
      {hint ? (
        <p id={`${id}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  )
}
