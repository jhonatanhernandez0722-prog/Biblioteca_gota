'use client'

import { Pencil, Plus } from 'lucide-react'
import { useActionState, useEffect, useId, useRef } from 'react'
import { addCopiesAction, setCopyStatusAction, updateCopyAction } from '@/actions/admin'
import { ActionButton } from '@/components/ui/ConfirmAction'
import { FieldError, FormAlert } from '@/components/ui/FormFeedback'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { toast } from '@/components/ui/toast'
import { COPY_CONDITION, COPY_STATUS } from '@/lib/status'
import type { Copy, CopyCondition } from '@/lib/types'
import styles from './CopyManager.module.css'

export function AddCopiesForm({ bookId }: { bookId: number }) {
  const uid = useId()
  const [state, action] = useActionState(addCopiesAction, null)
  useEffect(() => {
    if (state?.ok && state.message) toast(state.message)
  }, [state])
  return (
    <form action={action} className={styles.addForm}>
      <input type="hidden" name="bookId" value={bookId} />
      {state && !state.ok ? <FormAlert state={state} /> : null}
      <div className="field">
        <label htmlFor={`${uid}-count`}>Cantidad</label>
        <input id={`${uid}-count`} name="count" type="number" min={1} max={50} defaultValue={1} className="input" />
        <FieldError id={`${uid}-count-error`} message={state?.fieldErrors?.count} />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-location`}>Ubicación</label>
        <input id={`${uid}-location`} name="location" className="input" maxLength={100} placeholder="Sala general, estante C" />
      </div>
      <div className="field">
        <label htmlFor={`${uid}-condition`}>Estado físico</label>
        <select id={`${uid}-condition`} name="condition" className="select" defaultValue="new">
          {Object.entries(COPY_CONDITION).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton className="btn btn--secondary" pendingLabel="Registrando…">
        <Plus aria-hidden="true" />
        Registrar
      </SubmitButton>
    </form>
  )
}

function EditCopyDialog({ copy }: { copy: Copy }) {
  const uid = useId()
  const dialog = useRef<HTMLDialogElement>(null)
  const [state, action] = useActionState(updateCopyAction, null)
  useEffect(() => {
    if (state?.ok) {
      dialog.current?.close()
      toast(state.message ?? 'Ejemplar actualizado.')
    }
  }, [state])
  return (
    <>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => dialog.current?.showModal()}>
        <Pencil aria-hidden="true" />
        Editar
      </button>
      <dialog ref={dialog} className="dialog" aria-labelledby={`${uid}-title`}>
        <form action={action} className="dialog-body">
          <h2 id={`${uid}-title`} className="dialog-title">
            Ejemplar {copy.code}
          </h2>
          <input type="hidden" name="copyId" value={copy.id} />
          <input type="hidden" name="bookId" value={copy.bookId} />
          {state && !state.ok ? <FormAlert state={state} /> : null}
          <div className="field">
            <label htmlFor={`${uid}-location`}>Ubicación</label>
            <input id={`${uid}-location`} name="location" className="input" maxLength={100} defaultValue={copy.location ?? ''} />
          </div>
          <div className="field">
            <label htmlFor={`${uid}-condition`}>Estado físico</label>
            <select id={`${uid}-condition`} name="condition" className="select" defaultValue={copy.condition}>
              {(Object.keys(COPY_CONDITION) as CopyCondition[]).map((value) => (
                <option key={value} value={value}>
                  {COPY_CONDITION[value]}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor={`${uid}-notes`}>Notas internas</label>
            <textarea id={`${uid}-notes`} name="notes" className="textarea" maxLength={300} defaultValue={copy.notes ?? ''} style={{ minHeight: 88 }} />
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn btn--ghost" onClick={() => dialog.current?.close()}>
              Cancelar
            </button>
            <SubmitButton className="btn">Guardar ejemplar</SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  )
}

export function CopiesTable({ copies }: { copies: Copy[] }) {
  if (copies.length === 0) {
    return <p className="muted">Este título aún no tiene ejemplares. Registra el primero arriba.</p>
  }
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="visually-hidden">Ejemplares físicos de este título</caption>
        <thead>
          <tr>
            <th scope="col">Código</th>
            <th scope="col">Ubicación</th>
            <th scope="col">Estado físico</th>
            <th scope="col">Situación</th>
            <th scope="col" className="actions">
              <span className="visually-hidden">Acciones</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {copies.map((copy) => {
            const inCirculation = copy.status === 'reserved' || copy.status === 'on_loan'
            const hidden = { copyId: copy.id, bookId: copy.bookId }
            return (
              <tr key={copy.id}>
                <td style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 650 }}>{copy.code}</td>
                <td>{copy.location ?? 'Sin ubicación'}</td>
                <td>{COPY_CONDITION[copy.condition]}</td>
                <td>
                  <span className={`badge badge--${COPY_STATUS[copy.status].tone}`}>{COPY_STATUS[copy.status].label}</span>
                </td>
                <td className="actions">
                  <div className={styles.actions}>
                    <EditCopyDialog copy={copy} />
                    {inCirculation ? (
                      <span className="meta">En un préstamo en curso</span>
                    ) : copy.status === 'available' ? (
                      <>
                        <ActionButton action={setCopyStatusAction} hidden={{ ...hidden, status: 'maintenance' }} className="btn btn--ghost btn--sm">
                          A reparación
                        </ActionButton>
                        <ActionButton action={setCopyStatusAction} hidden={{ ...hidden, status: 'lost' }} className="btn btn--ghost btn--sm">
                          Extraviado
                        </ActionButton>
                        <ActionButton action={setCopyStatusAction} hidden={{ ...hidden, status: 'withdrawn' }} className="btn btn--ghost btn--sm">
                          Retirar
                        </ActionButton>
                      </>
                    ) : (
                      <ActionButton action={setCopyStatusAction} hidden={{ ...hidden, status: 'available' }} className="btn btn--secondary btn--sm">
                        Volver a estantería
                      </ActionButton>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
