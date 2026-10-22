import fs from 'node:fs/promises'
import path from 'node:path'
import { env, resolveFromRoot } from '../../env'

/**
 * Almacenamiento de archivos desacoplado. Hoy: disco local fuera de `public/`
 * (los archivos solo salen a través de una ruta que valida el nombre).
 * Para S3, R2 o Supabase Storage basta con implementar esta interfaz.
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

class LocalFileStorage implements FileStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    if (!isValidStorageKey(key)) throw new Error(`Clave de almacenamiento no válida: ${key}`)
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

let storage: FileStorage | undefined

export function getStorage(): FileStorage {
  storage ??= new LocalFileStorage(path.resolve(resolveFromRoot(env().STORAGE_DIR)))
  return storage
}
