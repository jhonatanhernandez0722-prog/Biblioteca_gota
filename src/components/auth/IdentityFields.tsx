'use client'

import { CreditCard, ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { FieldError } from '@/components/ui/FormFeedback'
import {
  CARD_BRAND_LABEL,
  cardBrand,
  digitsOnly,
  DOCUMENT_TYPES,
  formatCardInput,
  normalizePhone,
  validateCreditCard,
  validateDocument,
  type DocumentType,
} from '@/lib/identity'
import styles from './AuthForms.module.css'

function describe(id: string, hint: boolean, error?: string) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined
}

/**
 * Teléfono, documento de identidad y tarjeta de crédito: lo que exige pedir préstamos.
 * Valida al salir de cada campo con las mismas reglas que el servidor, para que el error
 * aparezca antes de enviar. El número de la tarjeta se envía una sola vez y el servidor
 * solo conserva la franquicia y los últimos cuatro dígitos.
 */
export function IdentityFields({
  errors = {},
  values = {},
  savedCard,
  hideLegend = false,
}: {
  errors?: Record<string, string>
  values?: Record<string, string>
  /** «Visa terminada en 4242»: si ya hay una tarjeta guardada, se muestra en la ayuda. */
  savedCard?: string | null
  /** Cuando el bloque ya está bajo un título equivalente (en «Mi perfil»). */
  hideLegend?: boolean
}) {
  const id = useId()
  const [docType, setDocType] = useState<DocumentType | ''>((values.documentType as DocumentType) || '')
  const [card, setCard] = useState('')
  const [local, setLocal] = useState<Record<string, string | undefined>>({})

  const error = (name: string) => local[name] ?? errors[name]
  const check = (name: string, message: string | undefined) => setLocal((prev) => ({ ...prev, [name]: message }))

  const brand = card ? cardBrand(digitsOnly(card)) : null
  const docRule = docType ? DOCUMENT_TYPES[docType] : null

  return (
    <fieldset className={`${styles.identity} ${hideLegend ? styles.identityPlain : ''}`}>
      <legend className={hideLegend ? 'visually-hidden' : styles.identityLegend}>
        <ShieldCheck aria-hidden="true" /> Datos para pedir préstamos
      </legend>
      {hideLegend ? null : (
        <p className="field-hint">Los pedimos una vez para identificarte en el mostrador y respaldar tus préstamos.</p>
      )}

      <div className="field" data-invalid={Boolean(error('phone'))}>
        <label htmlFor={`${id}-phone`}>Número de teléfono</label>
        <input
          id={`${id}-phone`}
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          className="input"
          maxLength={20}
          required
          placeholder="300 123 4567"
          defaultValue={values.phone}
          aria-invalid={Boolean(error('phone')) || undefined}
          aria-describedby={describe(`${id}-phone`, true, error('phone'))}
          onBlur={(e) =>
            check(
              'phone',
              e.target.value && !normalizePhone(e.target.value) ? 'Revisa el teléfono: 10 dígitos, celular (3…) o fijo (60…).' : undefined,
            )
          }
        />
        <p id={`${id}-phone-hint`} className="field-hint">
          Celular o fijo de Colombia. Te llamaremos solo por tus préstamos.
        </p>
        <FieldError id={`${id}-phone-error`} message={error('phone')} />
      </div>

      <div className={styles.docRow}>
        <div className="field" data-invalid={Boolean(error('documentType'))}>
          <label htmlFor={`${id}-doctype`}>Documento</label>
          <select
            id={`${id}-doctype`}
            name="documentType"
            className="select"
            required
            value={docType}
            onChange={(e) => {
              setDocType(e.target.value as DocumentType)
              check('documentType', undefined)
            }}
            aria-invalid={Boolean(error('documentType')) || undefined}
            aria-describedby={describe(`${id}-doctype`, false, error('documentType'))}
          >
            <option value="" disabled>
              Elige…
            </option>
            {(Object.keys(DOCUMENT_TYPES) as DocumentType[]).map((type) => (
              <option key={type} value={type}>
                {type} · {DOCUMENT_TYPES[type].label}
              </option>
            ))}
          </select>
          <FieldError id={`${id}-doctype-error`} message={error('documentType')} />
        </div>
        <div className="field" data-invalid={Boolean(error('documentNumber'))}>
          <label htmlFor={`${id}-docnum`}>Número de documento</label>
          <input
            id={`${id}-docnum`}
            name="documentNumber"
            inputMode="numeric"
            autoComplete="off"
            className="input"
            maxLength={14}
            required
            defaultValue={values.documentNumber}
            aria-invalid={Boolean(error('documentNumber')) || undefined}
            aria-describedby={describe(`${id}-docnum`, true, error('documentNumber'))}
            onBlur={(e) => {
              if (!e.target.value || !docType) return check('documentNumber', undefined)
              const result = validateDocument(docType, e.target.value)
              check('documentNumber', result.ok ? undefined : result.message)
            }}
          />
          <p id={`${id}-docnum-hint`} className="field-hint">
            {docRule ? `Entre ${docRule.min} y ${docRule.max} dígitos, sin puntos.` : 'Sin puntos ni espacios.'}
            {docType === 'TI' ? ' Con TI, tu representante legal autoriza la cuenta.' : ''}
          </p>
          <FieldError id={`${id}-docnum-error`} message={error('documentNumber')} />
        </div>
      </div>

      <div className="field" data-invalid={Boolean(error('creditCard'))}>
        <label htmlFor={`${id}-card`}>Tarjeta de crédito</label>
        <div className={styles.cardField}>
          <CreditCard aria-hidden="true" className={styles.cardIcon} />
          <input
            id={`${id}-card`}
            name="creditCard"
            inputMode="numeric"
            autoComplete="cc-number"
            className="input"
            maxLength={23}
            required
            placeholder="0000 0000 0000 0000"
            value={card}
            onChange={(e) => setCard(formatCardInput(e.target.value))}
            onBlur={() => {
              if (!card) return check('creditCard', undefined)
              const result = validateCreditCard(card)
              check('creditCard', result.ok ? undefined : result.message)
            }}
            aria-invalid={Boolean(error('creditCard')) || undefined}
            aria-describedby={describe(`${id}-card`, true, error('creditCard'))}
          />
          {brand && brand !== 'other' ? <span className={styles.cardBrand}>{CARD_BRAND_LABEL[brand]}</span> : null}
        </div>
        <p id={`${id}-card-hint`} className="field-hint">
          {savedCard ? `Tienes guardada una ${savedCard}. Escríbela de nuevo o pon otra. ` : ''}
          Solo guardamos la franquicia y los últimos 4 dígitos. No pedimos CVV ni hacemos cargos.
        </p>
        <FieldError id={`${id}-card-error`} message={error('creditCard')} />
      </div>
    </fieldset>
  )
}
