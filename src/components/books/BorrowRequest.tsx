'use client'

import { CalendarClock, CircleAlert, IdCard, Lock } from 'lucide-react'
import { useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react'
import { addDays, endOfLibraryDay, formatDate } from '@/lib/dates'
import { fineAmount, formatCOP } from '@/lib/fines'
import { FINE_RULES, LOAN_RULES } from '@/lib/rules'
import type { ActionState, LoanCard } from '@/lib/types'
import { FieldError, FormAlert } from '@/components/ui/FormFeedback'
import { toast } from '@/components/ui/toast'
import styles from './BorrowRequest.module.css'

type ServerAction = (state: ActionState | null, formData: FormData) => Promise<ActionState>

/** Ritmo de lectura con el que se sugiere un plazo (el mismo que propone la calculadora). */
const SUGGESTED_PACE = 20

/**
 * Solicitud (o reserva) de un libro: el lector elige el plazo de lectura y el carné, y
 * confirma de forma expresa que el plazo no se podrá cambiar. El servidor vuelve a
 * validar todo; aquí solo se guía la decisión.
 */
export function BorrowRequest({
  action,
  mode,
  bookId,
  slug,
  title,
  pageCount,
  cards,
  triggerLabel,
  triggerIcon,
}: {
  action: ServerAction
  mode: 'request' | 'reserve'
  bookId: number
  slug: string
  title: string
  pageCount: number | null
  cards: LoanCard[]
  triggerLabel: string
  triggerIcon?: ReactNode
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const cardInputId = useId()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionState | null>(null)
  const [openedAt, setOpenedAt] = useState<Date | null>(null)

  const readingDays = pageCount ? Math.max(1, Math.ceil(pageCount / SUGGESTED_PACE)) : null
  const suggested = readingDays
    ? (LOAN_RULES.loanPeriods.find((d) => d >= readingDays) ?? LOAN_RULES.loanPeriods.at(-1)!)
    : LOAN_RULES.defaultLoanDays
  const [days, setDays] = useState<number>(suggested)
  const primary = cards.find((c) => c.isPrimary) ?? cards[0]
  const [card, setCard] = useState<string>(primary ? String(primary.id) : 'new')
  const [confirmed, setConfirmed] = useState(false)

  const open = () => {
    setResult(null)
    setConfirmed(false)
    setOpenedAt(new Date())
    dialog.current?.showModal()
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    startTransition(async () => {
      const outcome = await action(null, data)
      if (outcome.ok) {
        dialog.current?.close()
        toast(outcome.message ?? 'Hecho.')
      } else {
        setResult(outcome)
      }
    })
  }

  const errors = result?.fieldErrors ?? {}
  const reserve = mode === 'reserve'
  const verb = reserve ? 'Reservar' : 'Confirmar préstamo'

  return (
    <>
      <button type="button" className="btn btn--block" onClick={open}>
        {triggerIcon}
        {triggerLabel}
      </button>
      <dialog ref={dialog} className={`dialog ${styles.dialog}`} aria-labelledby={titleId}>
        <form onSubmit={submit} className="dialog-body" noValidate>
          <div>
            <h2 id={titleId} className="dialog-title">
              {reserve ? 'Reservar' : 'Pedir'} «{title}»
            </h2>
            <p className="meta">
              {reserve
                ? 'Cuando vuelva un ejemplar lo apartaremos para ti con este plazo y este carné.'
                : `Lo apartamos en el mostrador y tienes ${LOAN_RULES.pickupDays} días para recogerlo.`}
            </p>
          </div>

          <input type="hidden" name="bookId" value={bookId} />
          <input type="hidden" name="slug" value={slug} />

          <fieldset className={styles.group}>
            <legend className="field-label">
              <CalendarClock aria-hidden="true" /> Plazo de lectura
            </legend>
            <div className={styles.periods}>
              {LOAN_RULES.loanPeriods.map((d) => (
                <label key={d} className={styles.period} data-checked={days === d}>
                  <input type="radio" name="loanDays" value={d} checked={days === d} onChange={() => setDays(d)} />
                  <span className={styles.periodDays}>{d}</span>
                  <span className={styles.periodUnit}>días</span>
                  {d === suggested && readingDays ? <span className={styles.periodTag}>Sugerido</span> : null}
                </label>
              ))}
            </div>
            <p className="field-hint">
              {reserve
                ? `Los ${days} días contarán desde que lo recojas.`
                : openedAt
                  ? `Si lo recoges hoy, lo devuelves hasta el ${formatDate(endOfLibraryDay(addDays(openedAt, days)))}.`
                  : `Los ${days} días cuentan desde que lo recoges.`}
              {readingDays
                ? ` A ${SUGGESTED_PACE} páginas al día lo terminarías en unos ${readingDays} ${readingDays === 1 ? 'día' : 'días'}.`
                : ''}
            </p>
            <FieldError id={`${titleId}-days`} message={errors.loanDays} />
          </fieldset>

          <fieldset className={styles.group}>
            <legend className="field-label">
              <IdCard aria-hidden="true" /> Carné de préstamo
            </legend>
            <div className={styles.cards}>
              {cards.map((c) => (
                <label key={c.id} className="check">
                  <input type="radio" name="card" value={c.id} checked={card === String(c.id)} onChange={() => setCard(String(c.id))} />
                  <span>
                    <strong className={styles.cardNumber}>{c.number}</strong>
                    <span className="meta"> · {c.label}</span>
                  </span>
                </label>
              ))}
              <label className="check">
                <input type="radio" name="card" value="new" checked={card === 'new'} onChange={() => setCard('new')} />
                Introducir otro número de carné
              </label>
            </div>
            {card === 'new' ? (
              <div className="field" data-invalid={Boolean(errors.cardNumber)}>
                <label htmlFor={cardInputId} className="visually-hidden">
                  Número de carné
                </label>
                <input
                  id={cardInputId}
                  name="cardNumber"
                  className={`input ${styles.cardInput}`}
                  placeholder="GG-26-00042"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={24}
                  required
                  aria-invalid={Boolean(errors.cardNumber) || undefined}
                  aria-describedby={`${cardInputId}-hint${errors.cardNumber ? ` ${cardInputId}-error` : ''}`}
                />
                <p id={`${cardInputId}-hint`} className="field-hint">
                  Lo guardaremos en tu cuenta para que la próxima vez solo tengas que elegirlo.
                </p>
                <FieldError id={`${cardInputId}-error`} message={errors.cardNumber ?? errors.cardId} />
              </div>
            ) : (
              <FieldError id={`${cardInputId}-error`} message={errors.cardId} />
            )}
          </fieldset>

          <div className="alert alert--warning" role="note">
            <Lock aria-hidden="true" />
            <p>
              <strong>El plazo es definitivo.</strong> Al confirmar no podrás ampliarlo, acortarlo ni renovarlo. Cada día
              de retraso suma {formatCOP(FINE_RULES.dailyFine)}: 3 días tarde serían {formatCOP(fineAmount(3))}.
            </p>
          </div>

          <div className="field" data-invalid={Boolean(errors.confirmTerm)}>
            <label className="check">
              <input
                type="checkbox"
                name="confirmTerm"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                required
                aria-invalid={Boolean(errors.confirmTerm) || undefined}
              />
              Entiendo que el plazo de {days} días no se podrá cambiar.
            </label>
            <FieldError id={`${titleId}-confirm`} message={errors.confirmTerm} />
          </div>

          {result && !result.ok && !Object.keys(errors).length ? <FormAlert state={result} /> : null}
          {result && !result.ok && Object.keys(errors).length ? (
            <p className="field-error" role="alert">
              <CircleAlert aria-hidden="true" />
              {result.message}
            </p>
          ) : null}

          <div className="dialog-actions">
            <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()}>
              Cancelar
            </button>
            <button type="submit" className="btn" disabled={pending || !confirmed} aria-disabled={pending || !confirmed} data-pending={pending}>
              {pending ? <span className="spinner" aria-hidden="true" /> : null}
              {verb} · {days} días
            </button>
          </div>
        </form>
      </dialog>
    </>
  )
}
