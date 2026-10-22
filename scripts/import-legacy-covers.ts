import fs from 'node:fs/promises'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { loadEnv } from './load-env'

const KEY_PATTERN = /^[a-f0-9-]{36}\.jpg$/

async function main() {
  loadEnv()
  const args = new Set(process.argv.slice(2))
  const dryRun = args.has('--dry-run')
  if (!dryRun && !args.has('--confirm')) {
    throw new Error('No se subieron portadas. Ejecuta con --dry-run para revisar o --confirm para importar.')
  }
  if (dryRun && args.has('--confirm')) throw new Error('Usa --dry-run o --confirm, no ambos.')

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) throw new Error('Falta BLOB_READ_WRITE_TOKEN.')
  if (process.env.STORAGE_TYPE !== 'vercel_blob') {
    throw new Error('STORAGE_TYPE debe ser vercel_blob para importar las portadas.')
  }

  const root = process.cwd()
  const sourcePath = path.join(root, 'data', 'gotagota.db')
  const coversPath = path.join(root, 'storage', 'covers')
  const source = new DatabaseSync(sourcePath, { readOnly: true })
  let keys: string[]
  try {
    keys = (source.prepare('SELECT cover_key FROM books WHERE cover_key IS NOT NULL').all() as { cover_key: string }[])
      .map((row) => row.cover_key)
  } finally {
    source.close()
  }

  const files = await Promise.all(
    keys.map(async (key) => {
      if (!KEY_PATTERN.test(key)) throw new Error(`Nombre de portada no válido: ${key}`)
      return { key, data: await fs.readFile(path.join(coversPath, key)) }
    }),
  )
  const { head, put, BlobNotFoundError } = await import('@vercel/blob')
  const missing: typeof files = []
  for (const file of files) {
    try {
      await head(`covers/${file.key}`, { token })
    } catch (error) {
      if (error instanceof BlobNotFoundError) missing.push(file)
      else throw error
    }
  }

  if (dryRun) {
    console.log(JSON.stringify({ coverReferences: files.length, alreadyInBlob: files.length - missing.length, toUpload: missing.length }))
    return
  }

  for (const file of missing) {
    await put(`covers/${file.key}`, file.data, {
      access: 'public',
      token,
      contentType: 'image/jpeg',
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 31_536_000,
    })
  }

  let verified = 0
  for (const file of files) {
    await head(`covers/${file.key}`, { token })
    verified++
  }
  console.log(JSON.stringify({ uploaded: missing.length, verified, coverReferences: files.length }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
