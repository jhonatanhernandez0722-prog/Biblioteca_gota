import fs from 'node:fs'
import path from 'node:path'

/** Carga `.env` (si existe) para los scripts que se ejecutan fuera de Next. */
export function loadEnv() {
  const file = path.join(process.cwd(), '.env')
  if (fs.existsSync(file)) process.loadEnvFile(file)
}
