import { all, get, run } from './db'

export interface AuditEntry {
  id: number
  actorId: number | null
  actorName: string | null
  action: string
  entityType: string
  entityId: number | null
  summary: string
  details: string | null
  createdAt: string
}

export function logAudit(input: {
  actorId: number | null
  action: string
  entityType: string
  entityId?: number | null
  summary: string
  details?: Record<string, unknown>
}) {
  run(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, summary, details)
     VALUES (:actorId, :action, :entityType, :entityId, :summary, :details)`,
    {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      summary: input.summary,
      details: input.details ? JSON.stringify(input.details) : null,
    },
  )
}

/** Frase legible de una entrada: «Julián Pardo aprobó…» o, si la hizo el sistema, la acción sola. */
export function describeAudit(entry: Pick<AuditEntry, 'actorName' | 'summary'>): string {
  if (!entry.actorName) return entry.summary
  return `${entry.actorName} ${entry.summary.charAt(0).toLowerCase()}${entry.summary.slice(1)}`
}

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  book: 'Libros',
  copy: 'Ejemplares',
  loan: 'Préstamos',
  reservation: 'Reservas',
  user: 'Usuarios',
}

export function listAudit(options: { page: number; pageSize: number; entityType?: string; entityId?: number }) {
  const where: string[] = []
  const params: Record<string, string | number> = {}
  if (options.entityType) {
    where.push('a.entity_type = :entityType')
    params.entityType = options.entityType
  }
  if (options.entityId) {
    where.push('a.entity_id = :entityId')
    params.entityId = options.entityId
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const total =
    get<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_log a ${clause}`, params)?.n ?? 0
  const rows = all<{
    id: number
    actor_id: number | null
    actor_name: string | null
    action: string
    entity_type: string
    entity_id: number | null
    summary: string
    details: string | null
    created_at: string
  }>(
    `SELECT a.*, u.name AS actor_name
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
       ${clause}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT :limit OFFSET :offset`,
    { ...params, limit: options.pageSize, offset: (options.page - 1) * options.pageSize },
  )
  const entries: AuditEntry[] = rows.map((r) => ({
    id: r.id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    action: r.action,
    entityType: r.entity_type,
    entityId: r.entity_id,
    summary: r.summary,
    details: r.details,
    createdAt: r.created_at,
  }))
  return { entries, total }
}
