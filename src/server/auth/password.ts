import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from 'node:crypto'

/** Hash de contraseñas con scrypt (incluido en Node): sin dependencias nativas. */
const PARAMS = { N: 16384, r: 8, p: 1, keylen: 64 }
const MAXMEM = 64 * 1024 * 1024

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, key) => (error ? reject(error) : resolve(key)))
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, PARAMS.keylen, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: MAXMEM,
  })
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split('$')
  if (scheme !== 'scrypt' || !n || !r || !p || !saltB64 || !keyB64) return false
  const expected = Buffer.from(keyB64, 'base64')
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** Hash ficticio para igualar tiempos cuando el correo no existe. */
let dummyHash: Promise<string> | undefined
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(12).toString('hex'))
  return dummyHash
}
