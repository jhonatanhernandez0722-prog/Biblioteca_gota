export type ToastTone = 'success' | 'info' | 'warning'

export interface ToastDetail {
  message: string
  tone: ToastTone
}

export const TOAST_EVENT = 'gg:toast'

/** Muestra un aviso breve. Funciona desde cualquier componente de cliente. */
export function toast(message: string, tone: ToastTone = 'success') {
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message, tone } }))
}
