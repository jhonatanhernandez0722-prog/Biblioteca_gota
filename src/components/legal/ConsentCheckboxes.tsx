import { ExternalLink } from 'lucide-react'
import { FieldError } from '@/components/ui/FormFeedback'
import { LEGAL_DOCUMENTS, LEGAL_PATH } from '@/lib/legal'
import styles from './ConsentCheckboxes.module.css'

const ITEMS = [
  {
    name: 'acceptTerms',
    slug: 'terminos',
    label: 'He leído y acepto los términos y condiciones',
    link: 'Leer los términos y condiciones',
  },
  {
    name: 'acceptPrivacy',
    slug: 'privacidad',
    label: 'He leído la política de privacidad y autorizo el tratamiento de mis datos personales conforme a lo allí informado',
    link: 'Leer la política de privacidad',
  },
] as const

/**
 * Dos aceptaciones independientes, desmarcadas al cargar. Los enlaces abren en otra
 * pestaña para no perder lo escrito. El servidor vuelve a validar ambas.
 */
export function ConsentCheckboxes({
  errors,
  only,
}: {
  errors?: Record<string, string>
  only?: ('terminos' | 'privacidad')[]
}) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>Aceptaciones necesarias para crear tu cuenta</legend>
      {ITEMS.filter((i) => !only || only.includes(i.slug)).map((item) => {
        const doc = LEGAL_DOCUMENTS[item.slug]
        const error = errors?.[item.name]
        return (
          <div key={item.name} className={styles.item} data-invalid={Boolean(error)}>
            <label className="check">
              <input
                type="checkbox"
                name={item.name}
                required
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? `${item.name}-error` : undefined}
              />
              <span>{item.label}.</span>
            </label>
            <a href={LEGAL_PATH[item.slug]} target="_blank" rel="noopener" className={styles.link}>
              {item.link} (versión {doc.version})
              <ExternalLink aria-hidden="true" width={14} height={14} />
              <span className="visually-hidden"> (se abre en otra pestaña)</span>
            </a>
            <FieldError id={`${item.name}-error`} message={error} />
          </div>
        )
      })}
    </fieldset>
  )
}
