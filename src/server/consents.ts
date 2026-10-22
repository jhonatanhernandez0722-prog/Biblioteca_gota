import { createHash, randomUUID } from 'node:crypto'
import { ACCOUNT_CONSENTS, LEGAL_DOCUMENTS, LEGAL_HISTORY, type LegalDocument, type LegalSlug } from '@/lib/legal'
import { all, get, run, transaction } from './db'
import { DomainError } from './errors'

/**
 * Evidencias de consentimiento. Solo se añaden filas: la base de datos rechaza
 * modificaciones y borrados (triggers) y cada fila guarda el hash de la anterior,
 * de modo que una alteración por fuera de la aplicación rompe la cadena y se detecta.
 * Un registro demuestra qué cuenta aceptó qué versión, cuándo y en qué proceso;
 * no demuestra por sí solo la identidad de la persona que estaba frente a la pantalla.
 */

export type ConsentResult = 'accepted' | 'rejected' | 'revoked'

const GENESIS = '0'.repeat(64)

export function documentHash(doc: LegalDocument): string {
  return createHash('sha256')
    .update(JSON.stringify({ slug: doc.slug, version: doc.version, effectiveAt: doc.effectiveAt, sections: doc.sections }))
    .digest('hex')
}

/** Registra (una sola vez) cada versión publicada de los documentos. */
export function ensureDocumentVersions() {
  for (const doc of [...Object.values(LEGAL_DOCUMENTS), ...Object.values(LEGAL_HISTORY).flat()]) {
    const hash = documentHash(doc)
    const existing = get<{ content_hash: string }>(
      'SELECT content_hash FROM legal_document_versions WHERE slug = ? AND version = ?',
      [doc.slug, doc.version],
    )
    if (!existing) {
      run('INSERT INTO legal_document_versions (slug, version, title, effective_at, content_hash) VALUES (?, ?, ?, ?, ?)', [
        doc.slug,
        doc.version,
        doc.title,
        doc.effectiveAt,
        hash,
      ])
    } else if (existing.content_hash !== hash) {
      // Alguien editó el texto de una versión ya publicada.
      throw new Error(`El documento «${doc.slug}» v${doc.version} cambió sin subir de versión. Publica una versión nueva.`)
    }
  }
}

function rowHash(fields: Record<string, string | number | null>, prev: string): string {
  return createHash('sha256').update(prev).update(JSON.stringify(fields)).digest('hex')
}

export interface RecordConsentInput {
  userId: number
  slug: LegalSlug
  type: string
  result: ConsentResult
  source: string
  requestId?: string
}

/** Debe llamarse dentro de una transacción si acompaña a otra operación. */
export function recordConsent(input: RecordConsentInput): { eventId: string } {
  return transaction(() => {
    ensureDocumentVersions()
    const doc = LEGAL_DOCUMENTS[input.slug]
    const previous = get<{ id: number }>(
      'SELECT id FROM consent_records WHERE user_id = ? AND document_slug = ? ORDER BY id DESC LIMIT 1',
      [input.userId, input.slug],
    )
    const last = get<{ row_hash: string }>('SELECT row_hash FROM consent_records ORDER BY id DESC LIMIT 1')
    const prev = last?.row_hash ?? GENESIS
    const fields = {
      event_id: randomUUID(),
      request_id: input.requestId ?? null,
      user_id: input.userId,
      subject_ref: `user:${input.userId}`,
      document_slug: doc.slug,
      document_version: doc.version,
      document_effective_at: doc.effectiveAt,
      document_hash: documentHash(doc),
      consent_type: input.type,
      result: input.result,
      source: input.source,
      supersedes_id: previous?.id ?? null,
      recorded_at: new Date().toISOString(),
    }
    run(
      `INSERT INTO consent_records (event_id, request_id, user_id, subject_ref, document_slug, document_version,
         document_effective_at, document_hash, consent_type, result, source, supersedes_id, recorded_at, prev_hash, row_hash)
       VALUES (:event_id, :request_id, :user_id, :subject_ref, :document_slug, :document_version, :document_effective_at,
         :document_hash, :consent_type, :result, :source, :supersedes_id, :recorded_at, :prev_hash, :row_hash)`,
      { ...fields, prev_hash: prev, row_hash: rowHash(fields, prev) },
    )
    return { eventId: fields.event_id }
  })
}

export interface ConsentState {
  slug: 'terminos' | 'privacidad'
  result: ConsentResult | null
  version: string | null
  recordedAt: string | null
  current: boolean
}

/** Último estado de cada documento de la cuenta para un usuario. */
export function getConsentStates(userId: number): ConsentState[] {
  return ACCOUNT_CONSENTS.map(({ slug }) => {
    const row = get<{ result: ConsentResult; document_version: string; recorded_at: string }>(
      `SELECT result, document_version, recorded_at FROM consent_records
        WHERE user_id = ? AND document_slug = ? ORDER BY id DESC LIMIT 1`,
      [userId, slug],
    )
    return {
      slug,
      result: row?.result ?? null,
      version: row?.document_version ?? null,
      recordedAt: row?.recorded_at ?? null,
      current: row?.result === 'accepted' && row.document_version === LEGAL_DOCUMENTS[slug].version,
    }
  })
}

/** Documentos que el usuario debe (re)aceptar porque no los aceptó o cambió la versión. */
export function pendingConsents(userId: number): ('terminos' | 'privacidad')[] {
  return getConsentStates(userId)
    .filter((s) => !s.current)
    .map((s) => s.slug)
}

export function hasProcessingAuthorization(userId: number): boolean {
  return getConsentStates(userId).find((s) => s.slug === 'privacidad')?.current ?? false
}

export function revokeConsent(userId: number, slug: LegalSlug, source: string, requestId?: string) {
  const state = getConsentStates(userId).find((s) => s.slug === slug)
  if (state?.result !== 'accepted') throw new DomainError('No hay una aceptación vigente que revocar.', 'not_accepted')
  const type = ACCOUNT_CONSENTS.find((c) => c.slug === slug)!.type
  return recordConsent({ userId, slug, type, result: 'revoked', source, requestId })
}

export interface ConsentRecordView {
  id: number
  eventId: string
  requestId: string | null
  userId: number | null
  documentSlug: string
  documentVersion: string
  documentEffectiveAt: string
  consentType: string
  result: ConsentResult
  source: string
  supersedesId: number | null
  recordedAt: string
}

export function listConsentRecords(options: { userId?: number; page: number; pageSize: number }) {
  const where = options.userId ? 'WHERE user_id = :userId' : ''
  const params: Record<string, number> = options.userId ? { userId: options.userId } : {}
  const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM consent_records ${where}`, params)?.n ?? 0
  const rows = all<Record<string, string | number | null>>(
    `SELECT * FROM consent_records ${where} ORDER BY id DESC LIMIT :limit OFFSET :offset`,
    { ...params, limit: options.pageSize, offset: (options.page - 1) * options.pageSize },
  )
  const records: ConsentRecordView[] = rows.map((r) => ({
    id: Number(r.id),
    eventId: String(r.event_id),
    requestId: (r.request_id as string) ?? null,
    userId: r.user_id === null ? null : Number(r.user_id),
    documentSlug: String(r.document_slug),
    documentVersion: String(r.document_version),
    documentEffectiveAt: String(r.document_effective_at),
    consentType: String(r.consent_type),
    result: r.result as ConsentResult,
    source: String(r.source),
    supersedesId: r.supersedes_id === null ? null : Number(r.supersedes_id),
    recordedAt: String(r.recorded_at),
  }))
  return { records, total }
}

/** Recalcula la cadena completa. Devuelve el primer registro alterado, si lo hay. */
export function verifyConsentChain(): { ok: boolean; checked: number; brokenAt: number | null } {
  const rows = all<Record<string, string | number | null>>('SELECT * FROM consent_records ORDER BY id')
  const v = (r: Record<string, string | number | null>, k: string) => r[k] ?? null
  let prev = GENESIS
  for (const r of rows) {
    const fields = {
      event_id: v(r, 'event_id'),
      request_id: v(r, 'request_id'),
      user_id: v(r, 'user_id'),
      subject_ref: v(r, 'subject_ref'),
      document_slug: v(r, 'document_slug'),
      document_version: v(r, 'document_version'),
      document_effective_at: v(r, 'document_effective_at'),
      document_hash: v(r, 'document_hash'),
      consent_type: v(r, 'consent_type'),
      result: v(r, 'result'),
      source: v(r, 'source'),
      supersedes_id: v(r, 'supersedes_id'),
      recorded_at: v(r, 'recorded_at'),
    }
    if (r.prev_hash !== prev || rowHash(fields, prev) !== r.row_hash) {
      return { ok: false, checked: rows.length, brokenAt: Number(r.id) }
    }
    prev = String(r.row_hash)
  }
  return { ok: true, checked: rows.length, brokenAt: null }
}
