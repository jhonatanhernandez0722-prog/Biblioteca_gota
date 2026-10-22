import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { loadEnv } from './load-env'

const TABLES = [
  'users',
  'categories',
  'books',
  'book_authors',
  'book_categories',
  'copies',
  'loans',
  'reservations',
  'legal_document_versions',
  'consent_records',
  'audit_log',
  'sessions',
  'password_resets',
] as const

const SEQUENCED_TABLES = [
  'users',
  'categories',
  'books',
  'copies',
  'loans',
  'reservations',
  'legal_document_versions',
  'consent_records',
  'audit_log',
] as const

const BOOLEAN_COLUMNS: Partial<Record<(typeof TABLES)[number], string[]>> = {
  users: ['is_demo'],
  books: ['featured', 'editorial_pick', 'is_demo'],
  loans: ['is_demo'],
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) throw new Error(`Identificador SQL no válido: ${identifier}`)
  return `"${identifier}"`
}

async function main() {
  loadEnv()
  const args = new Set(process.argv.slice(2))
  const dryRun = args.has('--dry-run')
  if (!dryRun && !args.has('--confirm')) {
    throw new Error('No se escribió en Neon. Ejecuta con --dry-run para revisar o --confirm para importar.')
  }
  if (dryRun && args.has('--confirm')) throw new Error('Usa --dry-run o --confirm, no ambos.')

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl?.startsWith('postgres')) {
    throw new Error('DATABASE_URL debe apuntar a PostgreSQL/Neon.')
  }

  const sourcePath = path.join(process.cwd(), 'data', 'gotagota.db')
  if (!fs.existsSync(sourcePath)) throw new Error(`No se encontró la base SQLite anterior: ${sourcePath}`)

  const source = new DatabaseSync(sourcePath, { readOnly: true })
  const sourceRows = new Map<(typeof TABLES)[number], Record<string, unknown>[]>()
  const sourceColumns = new Map<(typeof TABLES)[number], string[]>()
  const sourceCounts: Record<string, number> = {}
  try {
    source.exec('BEGIN')
    const violations = source.prepare('PRAGMA foreign_key_check').all()
    if (violations.length) throw new Error(`La base SQLite tiene ${violations.length} relaciones inválidas.`)

    for (const table of TABLES) {
      const columns = source.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as { name: string }[]
      if (!columns.length) throw new Error(`No se encontró la tabla SQLite ${table}.`)
      const rows = source.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all() as Record<string, unknown>[]
      sourceColumns.set(table, columns.map((column) => column.name))
      sourceRows.set(table, rows)
      sourceCounts[table] = rows.length
    }
  } finally {
    source.exec('ROLLBACK')
    source.close()
  }

  const { Pool } = await import('@neondatabase/serverless')
  const pool = new Pool({ connectionString: databaseUrl, max: 1 })
  try {
    const client = await pool.connect()
    try {
      await client.query(dryRun ? 'BEGIN READ ONLY' : 'BEGIN')
      if (!dryRun) await client.query('SELECT pg_advisory_xact_lock(727275)')

      const schema = await client.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ANY($1)
          ORDER BY table_name, ordinal_position`,
        [TABLES],
      )
      const neonColumns = new Map<string, string[]>()
      for (const row of schema.rows) {
        const columns = neonColumns.get(row.table_name) ?? []
        columns.push(row.column_name)
        neonColumns.set(row.table_name, columns)
      }
      for (const table of TABLES) {
        const expected = sourceColumns.get(table)!
        const actual = neonColumns.get(table) ?? []
        if (expected.length !== actual.length || expected.some((column, index) => column !== actual[index])) {
          throw new Error(`Las columnas de ${table} no coinciden entre SQLite y Neon.`)
        }
      }

      const targetCounts: Record<string, number> = {}
      for (const table of TABLES) {
        const result = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(table)}`)
        targetCounts[table] = Number(result.rows[0]?.count ?? 0)
      }
      const nonEmpty = Object.entries(targetCounts).filter(([, count]) => count !== 0)
      if (nonEmpty.length) {
        throw new Error(`Neon no está vacía; no se importó nada. Tablas con datos: ${nonEmpty.map(([table]) => table).join(', ')}.`)
      }

      if (dryRun) {
        await client.query('ROLLBACK')
        console.log(JSON.stringify({ dryRun: true, source: sourceCounts, destinationEmpty: true }, null, 2))
        return
      }

      for (const table of TABLES) {
        const rows = sourceRows.get(table)!
        if (!rows.length) continue
        const columns = Object.keys(rows[0]!)
        const names = columns.map(quoteIdentifier).join(', ')
        const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ')
        const insert = `INSERT INTO ${quoteIdentifier(table)} (${names}) VALUES (${placeholders})`
        for (const row of rows) {
          const values = columns.map((column) => {
            const value = row[column]
            if (column === 'details' && table === 'audit_log' && typeof value === 'string') {
              return JSON.parse(value)
            }
            if (BOOLEAN_COLUMNS[table]?.includes(column)) return Boolean(value)
            return value
          })
          await client.query(insert, values)
        }
      }

      for (const table of SEQUENCED_TABLES) {
        await client.query(
          `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE(MAX(id), 1), MAX(id) IS NOT NULL)
             FROM ${quoteIdentifier(table)}`,
          [table],
        )
      }

      const imported: Record<string, number> = {}
      for (const table of TABLES) {
        const result = await client.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${quoteIdentifier(table)}`)
        imported[table] = Number(result.rows[0]?.count ?? 0)
        if (imported[table] !== sourceCounts[table]) {
          throw new Error(`Verificación fallida en ${table}: origen ${sourceCounts[table]}, destino ${imported[table]}.`)
        }
      }

      await client.query('COMMIT')
      console.log(JSON.stringify({ imported, verified: true }, null, 2))
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
