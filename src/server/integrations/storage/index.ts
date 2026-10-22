import fs from 'node:fs/promises'
import path from 'node:path'
import { env, resolveFromRoot } from '../../env'

/**
 * Almacenamiento de archivos desacoplado: disco local (desarrollo) o Vercel Blob
 * (producción, STORAGE_TYPE=vercel_blob). Los archivos se sirven siempre a través de
 * /media/covers/[archivo], que valida el nombre antes de leer.
 */
export interface FileStorage {
  put(key: string, data: Buffer): Promise<void>
  read(key: string): Promise<Buffer | null>
  remove(key: string): Promise<void>
}

const KEY_PATTERN = /^[a-z]+\/[a-f0-9-]{36}\.(jpg|webp)$/

export function isValidStorageKey(key: string): boolean {
  return KEY_PATTERN.test(key)
}

function assertKey(key: string) {
  if (!isValidStorageKey(key)) throw new Error(`Clave de almacenamiento no válida: ${key}`)
}

class LocalFileStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    assertKey(key)
    const full = path.join(this.root, key)
    if (!full.startsWith(this.root)) throw new Error('Ruta fuera del almacenamiento')
    return full
  }

  async put(key: string, data: Buffer) {
    const file = this.resolve(key)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, data)
  }

  async read(key: string) {
    try {
      return await fs.readFile(this.resolve(key))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  async remove(key: string) {
    await fs.rm(this.resolve(key), { force: true })
  }
}

/** Vercel Blob. El token solo vive en el servidor; el navegador nunca habla con Blob. */
class VercelBlobStorage implements FileStorage {
  constructor(private readonly token: string) {}

  async put(key: string, data: Buffer) {
    assertKey(key)
    const { put } = await import('@vercel/blob')
    await put(key, data, {
      access: 'public',
      token: this.token,
      contentType: 'image/jpeg',
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 31_536_000,
    })
  }

  async read(key: string) {
    assertKey(key)
    const { head, BlobNotFoundError } = await import('@vercel/blob')
    try {
      const meta = await head(key, { token: this.token })
      const response = await fetch(meta.url, { signal: AbortSignal.timeout(10_000) })
      if (!response.ok) return null
      return Buffer.from(await response.arrayBuffer())
    } catch (error) {
      if (error instanceof BlobNotFoundError) return null
      throw error
    }
  }

  async remove(key: string) {
    assertKey(key)
    const { del } = await import('@vercel/blob')
    await del(key, { token: this.token })
  }
}

let storage: FileStorage | undefined

export function getStorage(): FileStorage {
  if (storage) return storage
  const config = env()
  if (config.STORAGE_TYPE === 'vercel_blob') {
    if (!config.BLOB_READ_WRITE_TOKEN) throw new Error('STORAGE_TYPE=vercel_blob necesita BLOB_READ_WRITE_TOKEN.')
    storage = new VercelBlobStorage(config.BLOB_READ_WRITE_TOKEN)
  } else {
    storage = new LocalFileStorage(path.resolve(resolveFromRoot(config.STORAGE_DIR)))
  }
  return storage
}
