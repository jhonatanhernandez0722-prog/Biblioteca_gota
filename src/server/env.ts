import path from 'node:path'
import { z } from 'zod'

/**
 * Configuración del servidor. Nada de lo que hay aquí llega al navegador:
 * las claves solo se leen en módulos de servidor.
 */
const schema = z.object({
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_PATH: z.string().default('./data/gotagota.db'),
  STORAGE_DIR: z.string().default('./storage'),
  DEMO_MODE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  BOOK_METADATA_PROVIDER: z.enum(['openlibrary', 'googlebooks']).default('openlibrary'),
  OPENLIBRARY_CONTACT_EMAIL: z.string().email().optional().or(z.literal('').transform(() => undefined)),
  GOOGLE_BOOKS_API_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
  MAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
  MAIL_FROM: z.string().default('Biblioteca Gota Gota <no-responder@example.org>'),
  LIBRARY_EMAIL: z.string().optional(),
  LIBRARY_PHONE: z.string().optional(),
  LIBRARY_ADDRESS: z.string().optional(),
  LIBRARY_HOURS: z.string().optional(),
  LEGAL_NAME: z.string().optional(),
  LEGAL_TAX_ID: z.string().optional(),
  LEGAL_ADDRESS: z.string().optional(),
  LEGAL_EMAIL: z.string().optional(),
  LEGAL_PHONE: z.string().optional(),
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
})

export type ServerEnv = z.infer<typeof schema>

let cached: ServerEnv | undefined

export function env(): ServerEnv {
  if (!cached) {
    const parsed = schema.safeParse(process.env)
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      throw new Error(`Configuración inválida en las variables de entorno: ${issues}`)
    }
    cached = parsed.data
  }
  return cached
}

/** Rutas de datos en tiempo de ejecución (base de datos, almacenamiento): no forman parte del empaquetado. */
export function resolveFromRoot(p: string): string {
  return path.isAbsolute(p) ? p : path.join(/*turbopackIgnore: true*/ process.cwd(), p)
}
