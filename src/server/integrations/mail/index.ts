import { env } from '../../env'

export interface MailMessage {
  to: string
  subject: string
  text: string
}

export interface Mailer {
  readonly kind: 'console' | 'resend'
  send(message: MailMessage): Promise<void>
}

/**
 * Desarrollo: escribe el correo en la consola del servidor.
 * En producción no imprime el contenido (puede llevar enlaces de un solo uso).
 */
class ConsoleMailer implements Mailer {
  readonly kind = 'console' as const
  async send(message: MailMessage) {
    if (process.env.NODE_ENV === 'test') return
    if (process.env.NODE_ENV === 'production') {
      console.warn(
        `[correo] No hay proveedor de correo configurado (MAIL_PROVIDER). No se envió «${message.subject}».`,
      )
      return
    }
    console.info(
      `\n[correo · solo desarrollo] Para: ${message.to}\nAsunto: ${message.subject}\n\n${message.text}\n`,
    )
  }
}

/** Resend (https://resend.com) mediante su API HTTP: no requiere SDK. */
class ResendMailer implements Mailer {
  readonly kind = 'resend' as const
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: MailMessage) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Resend respondió ${response.status}: ${body.slice(0, 200)}`)
    }
  }
}

let mailer: Mailer | undefined

export function getMailer(): Mailer {
  if (mailer) return mailer
  const config = env()
  if (config.MAIL_PROVIDER === 'resend') {
    if (!config.RESEND_API_KEY) {
      throw new Error('MAIL_PROVIDER=resend necesita RESEND_API_KEY.')
    }
    mailer = new ResendMailer(config.RESEND_API_KEY, config.MAIL_FROM)
  } else {
    mailer = new ConsoleMailer()
  }
  return mailer
}

/** Envía sin bloquear la respuesta y sin romper la operación si el correo falla. */
export function sendInBackground(message: MailMessage) {
  getMailer()
    .send(message)
    .catch((error) => console.error('[correo] Error al enviar:', error))
}
