import './setup'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { hashPassword, verifyPassword } from '@/server/auth/password'
import { rateLimit } from '@/server/auth/rate-limit'
import { createSessionRecord, deleteSession, findSessionUser, hashToken } from '@/server/auth/session'
import { get, run } from '@/server/db'
import { isDomainError } from '@/server/errors'
import {
  authenticate,
  changePassword,
  isResetTokenValid,
  maskEmail,
  registerUser,
  resetPassword,
} from '@/server/users'

describe('Contraseñas', () => {
  it('se guardan con scrypt y sal, y se verifican', async () => {
    const hash = await hashPassword('una frase larga y segura')
    assert.match(hash, /^scrypt\$16384\$8\$1\$/)
    assert.notEqual(hash, await hashPassword('una frase larga y segura'), 'la sal cambia el resultado')
    assert.equal(await verifyPassword('una frase larga y segura', hash), true)
    assert.equal(await verifyPassword('otra cosa', hash), false)
    assert.equal(await verifyPassword('x', 'formato-roto'), false)
  })
})

describe('Cuentas y sesiones', () => {
  it('registra, autentica sin distinguir mayúsculas en el correo y rechaza duplicados', async () => {
    const user = await registerUser({ name: 'Lucía', email: 'Lucia@Test.example', password: 'clave-segura-123' })
    assert.match(user.cardNumber, /^GG-\d{2}-\d{5}$/)
    assert.equal(user.role, 'reader')
    assert.ok(await authenticate('lucia@test.example', 'clave-segura-123'))
    assert.equal(await authenticate('lucia@test.example', 'incorrecta'), null)
    assert.equal(await authenticate('nadie@test.example', 'clave-segura-123'), null)
    await assert.rejects(
      registerUser({ name: 'Otra', email: 'lucia@test.example', password: 'clave-segura-123' }),
      (e: unknown) => isDomainError(e) && e.code === 'email_taken',
    )
  })

  it('las sesiones guardan solo el hash del token y caducan', async () => {
    const user = await registerUser({ name: 'Mario', email: 'mario@test.example', password: 'clave-segura-123' })
    const { token } = await createSessionRecord(user.id)
    assert.equal((await get<{ n: number }>('SELECT COUNT(*) AS n FROM sessions WHERE id = ?', [token]))?.n, 0)
    assert.equal((await findSessionUser(token))?.id, user.id)
    await run('UPDATE sessions SET expires_at = ? WHERE id = ?', [new Date(Date.now() - 1000).toISOString(), hashToken(token)])
    assert.equal(await findSessionUser(token), null)
    const second = await createSessionRecord(user.id)
    await deleteSession(second.token)
    assert.equal(await findSessionUser(second.token), null)
  })

  it('cambiar la contraseña exige la actual y cierra las demás sesiones', async () => {
    const user = await registerUser({ name: 'Nora', email: 'nora@test.example', password: 'clave-segura-123' })
    const keep = await createSessionRecord(user.id)
    const other = await createSessionRecord(user.id)
    await assert.rejects(changePassword(user.id, 'mala', 'nueva-clave-segura'), (e: unknown) => isDomainError(e))
    await changePassword(user.id, 'clave-segura-123', 'nueva-clave-segura', keep.token)
    assert.ok(await findSessionUser(keep.token))
    assert.equal(await findSessionUser(other.token), null)
    assert.ok(await authenticate('nora@test.example', 'nueva-clave-segura'))
  })

  it('el enlace de recuperación es de un solo uso', async () => {
    const user = await registerUser({ name: 'Olga', email: 'olga@test.example', password: 'clave-segura-123' })
    const token = 'token-de-prueba-suficientemente-largo'
    await run('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)', [
      user.id,
      hashToken(token),
      new Date(Date.now() + 3_600_000).toISOString(),
    ])
    assert.equal(await isResetTokenValid(token), true)
    await resetPassword(token, 'otra-clave-segura')
    assert.equal(await isResetTokenValid(token), false)
    await assert.rejects(resetPassword(token, 'una-mas-segura'), (e: unknown) => isDomainError(e) && e.code === 'invalid_token')
    assert.ok(await authenticate('olga@test.example', 'otra-clave-segura'))
  })

  it('oculta parte del correo en listados', () => {
    assert.equal(maskEmail('valentina@gotagota.example'), 'va…@gotagota.example')
  })
})

describe('Limitador de intentos', () => {
  it('bloquea tras el límite dentro de la ventana', () => {
    for (let i = 0; i < 3; i++) assert.equal(rateLimit('prueba', 3, 60_000).ok, true)
    const blocked = rateLimit('prueba', 3, 60_000)
    assert.equal(blocked.ok, false)
    assert.ok(blocked.retryAfterSeconds > 0)
  })
})
