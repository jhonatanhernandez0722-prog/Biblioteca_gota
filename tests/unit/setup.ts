import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/**
 * Debe importarse PRIMERO en cada archivo de prueba: cada archivo corre en su propio
 * proceso con una base de datos y un almacenamiento temporales.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gotagota-test-'))
const env = process.env as Record<string, string>
env.DATABASE_PATH = path.join(dir, 'test.db')
env.STORAGE_DIR = path.join(dir, 'storage')
env.NODE_ENV = 'test'
env.MAIL_PROVIDER = 'console'
env.APP_URL = 'http://localhost:3000'

export const TEST_DIR = dir
