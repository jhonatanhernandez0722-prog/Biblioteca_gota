'use client'

import { useEffect } from 'react'

/**
 * Mejora progresiva: al cambiar un filtro, el formulario se envía solo.
 * Sin JavaScript, el botón «Aplicar filtros» hace lo mismo.
 */
export function AutoSubmit({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null
    if (!form) return
    const onChange = (event: Event) => {
      const target = event.target as HTMLInputElement
      if (target.type === 'search' || target.type === 'text') return
      form.requestSubmit()
    }
    // URLs limpias: los campos vacíos no viajan en la consulta.
    const onSubmit = () => {
      const empty = Array.from(form.elements).filter(
        (el): el is HTMLInputElement | HTMLSelectElement =>
          (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) &&
          Boolean(el.name) &&
          el.value === '' &&
          !(el instanceof HTMLInputElement && el.type === 'radio' && !el.checked),
      )
      empty.forEach((el) => (el.disabled = true))
      window.setTimeout(() => empty.forEach((el) => (el.disabled = false)), 0)
    }
    form.addEventListener('change', onChange)
    form.addEventListener('submit', onSubmit)
    form.dataset.enhanced = 'true'
    return () => {
      form.removeEventListener('change', onChange)
      form.removeEventListener('submit', onSubmit)
    }
  }, [formId])
  return null
}

/** En pantallas pequeñas, los filtros empiezan plegados. */
export function CollapseOnMobile({ detailsId }: { detailsId: string }) {
  useEffect(() => {
    const details = document.getElementById(detailsId) as HTMLDetailsElement | null
    if (details && window.matchMedia('(max-width: 960px)').matches) details.open = false
  }, [detailsId])
  return null
}
