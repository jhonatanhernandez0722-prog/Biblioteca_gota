import fs from 'node:fs'
import path from 'node:path'
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite'
import { env, resolveFromRoot } from '../env'
import { MIGRATIONS } from './migrations'

type SqliteModule = typeof import('node:sqlite')
export type SqlParams = Record<string, SQLInputValue> | SQLInputValue[]

/**
 * SQLite nativo de Node (`node:sqlite`, Node ≥ 22.13): sin dependencias binarias.
 * `process.getBuiltinModule` evita que el empaquetador intente resolver el módulo.
 * Para cambiar a PostgreSQL bastaría con reimplementar este módulo y los repositorios.
 */
function loadSqlite(): SqliteModule {
  return process.getBuiltinModule('node:sqlite') as SqliteModule
}

interface DbState {
  db: DatabaseSync
  statements: Map<string, StatementSync>
  txDepth: number
}

const globalForDb = globalThis as unknown as { __gotaGotaDb?: DbState }

function state(): DbState {
  if (globalForDb.__gotaGotaDb) return globalForDb.__gotaGotaDb
  const file = resolveFromRoot(env().DATABASE_PATH)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const { DatabaseSync } = loadSqlite()
  const db = new DatabaseSync(file)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
  `)
  migrate(db)
  globalForDb.__gotaGotaDb = { db, statements: new Map(), txDepth: 0 }
  return globalForDb.__gotaGotaDb
}

export function getDb(): DatabaseSync {
  return state().db
}

export function migrate(db: DatabaseSync): string[] {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  const rows = db.prepare('SELECT id FROM schema_migrations').all() as unknown as { id: string }[]
  const applied = new Set(rows.map((r) => r.id))
  const appliedNow: string[] = []
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(
        migration.id,
        new Date().toISOString(),
      )
      db.exec('COMMIT')
      appliedNow.push(migration.id)
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
  return appliedNow
}

function statement(sql: string): StatementSync {
  const s = state()
  let stmt = s.statements.get(sql)
  if (!stmt) {
    stmt = s.db.prepare(sql)
    s.statements.set(sql, stmt)
  }
  return stmt
}

function bind(stmt: StatementSync, method: 'all' | 'get' | 'run', params?: SqlParams) {
  if (params === undefined) return stmt[method]()
  if (Array.isArray(params)) return stmt[method](...params)
  return stmt[method](params)
}

export function all<T>(sql: string, params?: SqlParams): T[] {
  return bind(statement(sql), 'all', params) as unknown as T[]
}

export function get<T>(sql: string, params?: SqlParams): T | undefined {
  return (bind(statement(sql), 'get', params) as unknown as T | undefined) ?? undefined
}

export function run(sql: string, params?: SqlParams): { changes: number; lastInsertRowid: number } {
  const result = bind(statement(sql), 'run', params) as { changes: number | bigint; lastInsertRowid: number | bigint }
  return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) }
}

/**
 * Ejecuta `fn` dentro de una transacción. `fn` debe ser síncrona: el acceso a
 * SQLite lo es, y así ninguna otra petición puede intercalarse a mitad de la operación.
 * Las transacciones anidadas se integran en la exterior.
 */
export function transaction<T>(fn: () => T): T {
  const s = state()
  if (s.txDepth > 0) {
    s.txDepth++
    try {
      return fn()
    } finally {
      s.txDepth--
    }
  }
  s.db.exec('BEGIN IMMEDIATE')
  s.txDepth = 1
  try {
    const result = fn()
    if (result instanceof Promise) {
      throw new Error('transaction() no admite funciones asíncronas')
    }
    s.db.exec('COMMIT')
    return result
  } catch (error) {
    s.db.exec('ROLLBACK')
    throw error
  } finally {
    s.txDepth = 0
  }
}

/** Marca de tiempo ISO en UTC, el formato de todas las fechas de la base de datos. */
export function now(): string {
  return new Date().toISOString()
}
