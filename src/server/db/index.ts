import { AsyncLocalStorage } from 'node:async_hooks'
import { env } from '../env'
import { MIGRATIONS } from './migrations'

/**
 * Acceso a PostgreSQL. En producción, Neon (DATABASE_URL); en pruebas y sin
 * DATABASE_URL, PGlite en memoria (PostgreSQL real compilado a WebAssembly).
 * Los servicios escriben SQL con parámetros `:nombre` o `?`; aquí se traducen a `$n`.
 */
export type SqlValue = string | number | boolean | null | Uint8Array
export type SqlParams = Record<string, SqlValue | undefined> | SqlValue[]

interface Executor {
  query(sql: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount: number }>
}

interface Driver extends Executor {
  transaction<T>(fn: (tx: Executor) => Promise<T>): Promise<T>
}

const INT8 = 20
const NUMERIC = 1700
const BOOL = 16
const DATE = 1082
const TIMESTAMPTZ = 1184
const TIMESTAMP = 1114
const JSONB = 3802
const JSON_OID = 114

/** Tipos de PostgreSQL → los que espera la aplicación (fechas ISO, enteros, 1/0). */
const PARSERS: Record<number, (value: string) => unknown> = {
  [INT8]: (v) => Number(v),
  [NUMERIC]: (v) => Number(v),
  [BOOL]: (v) => (v === 't' || v === 'true' ? 1 : 0),
  [DATE]: (v) => v,
  [TIMESTAMPTZ]: (v) => new Date(v).toISOString(),
  [TIMESTAMP]: (v) => new Date(`${v}Z`).toISOString(),
  [JSONB]: (v) => v,
  [JSON_OID]: (v) => v,
}

async function createNeonDriver(url: string): Promise<Driver> {
  const { Pool, types } = await import('@neondatabase/serverless')
  for (const [oid, parse] of Object.entries(PARSERS)) types.setTypeParser(Number(oid), parse)
  const pool = new Pool({ connectionString: url, max: 5 })
  const wrap = (client: { query: (s: string, p: unknown[]) => Promise<{ rows: unknown[]; rowCount: number | null }> }): Executor => ({
    async query(sql, params) {
      const result = await client.query(sql, params)
      return { rows: result.rows as Record<string, unknown>[], rowCount: result.rowCount ?? 0 }
    },
  })
  return {
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const result = await fn(wrap(client))
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK').catch(() => {})
        throw error
      } finally {
        client.release()
      }
    },
  }
}

async function createPgliteDriver(dataDir?: string): Promise<Driver> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { pg_trgm } = await import('@electric-sql/pglite/contrib/pg_trgm')
  const db = await PGlite.create(dataDir, { extensions: { pg_trgm }, parsers: PARSERS })
  let queue: Promise<unknown> = Promise.resolve()
  const exec: Executor = {
    async query(sql, params) {
      const result = await db.query<Record<string, unknown>>(sql, params)
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length }
    },
  }
  return {
    // Una sola conexión: las transacciones se serializan.
    query: (sql, params) => {
      const run = queue.then(() => exec.query(sql, params))
      queue = run.catch(() => {})
      return run
    },
    transaction(fn) {
      const run = queue.then(() =>
        db.transaction(async (tx) =>
          fn({
            async query(sql, params) {
              const result = await tx.query<Record<string, unknown>>(sql, params)
              return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length }
            },
          }),
        ),
      )
      queue = run.catch(() => {})
      return run
    },
  }
}

const globalForDb = globalThis as unknown as { __gotaGotaDb?: Promise<Driver> }

async function init(): Promise<Driver> {
  const url = env().DATABASE_URL
  const driver = url?.startsWith('postgres') ? await createNeonDriver(url) : await createPgliteDriver(url?.replace(/^pglite:/, '') || undefined)
  await migrate(driver)
  return driver
}

function driver(): Promise<Driver> {
  globalForDb.__gotaGotaDb ??= init().catch((error) => {
    globalForDb.__gotaGotaDb = undefined
    throw error
  })
  return globalForDb.__gotaGotaDb
}

async function migrate(db: Driver) {
  await db.query('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())', [])
  const { rows } = await db.query('SELECT id FROM schema_migrations', [])
  const applied = new Set(rows.map((r) => String(r.id)))
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue
    await db.transaction(async (tx) => {
      // Bloqueo para que dos instancias no apliquen la misma migración a la vez.
      await tx.query('SELECT pg_advisory_xact_lock(727274)', [])
      const again = await tx.query('SELECT 1 FROM schema_migrations WHERE id = $1', [migration.id])
      if (again.rows.length) return
      for (const statement of splitStatements(migration.sql)) await tx.query(statement, [])
      await tx.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id])
    })
  }
}

/** Separa sentencias respetando bloques $$ … $$ de funciones. */
export function splitStatements(sql: string): string[] {
  const out: string[] = []
  let current = ''
  let inDollar = false
  for (const line of sql.split('\n')) {
    if (line.trim().startsWith('--') && !inDollar) continue
    current += `${line}\n`
    if ((line.match(/\$\$/g)?.length ?? 0) % 2 === 1) inDollar = !inDollar
    if (!inDollar && line.trimEnd().endsWith(';')) {
      if (current.trim()) out.push(current.trim())
      current = ''
    }
  }
  if (current.trim()) out.push(current.trim())
  return out
}

/** `:nombre` y `?` → `$n`. Ignora `::tipo` y el contenido de cadenas. */
export function toPositional(sql: string, params?: SqlParams): { text: string; values: unknown[] } {
  const values: unknown[] = []
  const named = params && !Array.isArray(params) ? params : undefined
  const list = Array.isArray(params) ? params : []
  const indexOf = new Map<string, number>()
  let positional = 0
  let text = ''
  let inString = false
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!
    if (ch === "'") {
      inString = !inString
      text += ch
      continue
    }
    if (!inString && ch === '?') {
      values.push(list[positional++] ?? null)
      text += `$${values.length}`
      continue
    }
    if (!inString && ch === ':' && sql[i + 1] !== ':' && sql[i - 1] !== ':' && /[A-Za-z_]/.test(sql[i + 1] ?? '')) {
      const match = /^[A-Za-z_]\w*/.exec(sql.slice(i + 1))!
      const name = match[0]
      if (!named || !(name in named)) throw new Error(`Falta el parámetro :${name}`)
      if (!indexOf.has(name)) {
        values.push(named[name] ?? null)
        indexOf.set(name, values.length)
      }
      text += `$${indexOf.get(name)}`
      i += name.length
      continue
    }
    text += ch
  }
  return { text, values }
}

const txStorage = new AsyncLocalStorage<Executor>()

async function executor(): Promise<Executor> {
  return txStorage.getStore() ?? (await driver())
}

export async function all<T>(sql: string, params?: SqlParams): Promise<T[]> {
  const { text, values } = toPositional(sql, params)
  return (await (await executor()).query(text, values)).rows as T[]
}

export async function get<T>(sql: string, params?: SqlParams): Promise<T | undefined> {
  return (await all<T>(sql, params))[0]
}

/** En los INSERT devuelve el id de la fila creada (equivalente a lastInsertRowid). */
export async function run(sql: string, params?: SqlParams): Promise<{ changes: number; lastInsertRowid: number }> {
  const isInsert = /^\s*insert\b/i.test(sql) && !/\breturning\b/i.test(sql)
  const { text, values } = toPositional(isInsert ? `${sql.trim()} RETURNING *` : sql, params)
  const result = await (await executor()).query(text, values)
  return { changes: result.rowCount, lastInsertRowid: Number(result.rows[0]?.id ?? 0) }
}

/** Transacción; las llamadas anidadas se integran en la exterior. */
export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
  if (txStorage.getStore()) return fn()
  return (await driver()).transaction((tx) => txStorage.run(tx, fn))
}

export function now(): string {
  return new Date().toISOString()
}

/** Solo para scripts y pruebas: ejecuta SQL crudo con varias sentencias. */
export async function execRaw(sql: string) {
  const db = await executor()
  for (const statement of splitStatements(sql)) await db.query(statement, [])
}
