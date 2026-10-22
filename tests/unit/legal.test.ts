import './setup'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAllowed, parseChoice, serializeChoice } from '@/lib/cookie-consent'
import { LEGAL_DOCUMENTS } from '@/lib/legal'
import { getReaderEligibility, requestLoan } from '@/server/circulation'
import { createBook } from '@/server/catalog'
import { documentHash, getConsentStates, pendingConsents, recordConsent, revokeConsent, verifyConsentChain } from '@/server/consents'
import { all, execRaw, get, run } from '@/server/db'
import { isDomainError } from '@/server/errors'
import { registerUser } from '@/server/users'

describe('Registro de aceptaciones', () => {
  it('el registro con aceptaciones guarda dos evidencias independientes con la versión vigente', async () => {
    const user = await registerUser({ name: 'Rita', email: 'rita@test.example', password: 'clave-segura-123', consents: { source: 'formulario:registro', requestId: 'req-1' } })
    const rows = await all<Record<string, string>>(
      'SELECT document_slug, document_version, document_hash, result, source, request_id, consent_type, recorded_at FROM consent_records WHERE user_id = ? ORDER BY id',
      [user.id],
    )
    assert.equal(rows.length, 2)
    assert.deepEqual(rows.map((r) => r.document_slug), ['terminos', 'privacidad'])
    for (const r of rows) {
      const doc = LEGAL_DOCUMENTS[r.document_slug as 'terminos' | 'privacidad']
      assert.equal(r.document_version, doc.version)
      assert.equal(r.document_hash, documentHash(doc))
      assert.equal(r.result, 'accepted')
      assert.equal(r.source, 'formulario:registro')
      assert.equal(r.request_id, 'req-1')
      assert.match(String(r.recorded_at), /Z$/, 'hora del servidor en UTC')
    }
    assert.notEqual(rows[0]!.consent_type, rows[1]!.consent_type)
    assert.deepEqual(await pendingConsents(user.id), [])
  })

  it('no guarda contraseñas ni correos en las evidencias', async () => {
    const columns = (await all<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ?`,
      ['consent_records'],
    )).map((c) => c.column_name)
    for (const forbidden of ['email', 'password', 'password_hash', 'ip', 'user_agent']) assert.ok(!columns.includes(forbidden))
    const anyEmail = (await get<{ n: number }>("SELECT COUNT(*) AS n FROM consent_records WHERE subject_ref LIKE '%@%'"))?.n
    assert.equal(anyEmail, 0)
  })

  it('las evidencias no se pueden modificar ni borrar', async () => {
    await assert.rejects(() => run("UPDATE consent_records SET result = 'rejected'"), /no se pueden modificar/)
    await assert.rejects(() => run('DELETE FROM consent_records'), /no se pueden borrar/)
  })

  it('la cadena de hashes detecta una manipulación', async () => {
    assert.equal((await verifyConsentChain()).ok, true)
    await execRaw('DROP TRIGGER consent_records_no_update ON consent_records')
    await run("UPDATE consent_records SET source = 'manipulado' WHERE id = 1")
    const result = await verifyConsentChain()
    assert.equal(result.ok, false)
    assert.equal(result.brokenAt, 1)
    await run("UPDATE consent_records SET source = 'formulario:registro' WHERE id = 1")
    await execRaw(`CREATE TRIGGER consent_records_no_update BEFORE UPDATE ON consent_records
                   FOR EACH ROW EXECUTE FUNCTION forbid_change('Los registros de consentimiento no se pueden modificar')`)
    assert.equal((await verifyConsentChain()).ok, true)
  })

  it('sin aceptaciones vigentes no se puede pedir libros; revocar tiene efecto real', async () => {
    const user = await registerUser({ name: 'Saúl', email: 'saul@test.example', password: 'clave-segura-123' })
    assert.deepEqual(await pendingConsents(user.id), ['terminos', 'privacidad'])
    assert.equal((await getReaderEligibility(user.id)).canRequest, false)
    const { id: bookId } = await createBook({ title: 'Libro legal', authors: ['X'], categories: [] }, user.id)
    // Aceptar solo los términos no autoriza el tratamiento: son independientes.
    await recordConsent({ userId: user.id, slug: 'terminos', type: 'terms_acceptance', result: 'accepted', source: 'test' })
    assert.deepEqual(await pendingConsents(user.id), ['privacidad'])
    await recordConsent({ userId: user.id, slug: 'privacidad', type: 'data_processing_authorization', result: 'accepted', source: 'test' })
    assert.equal((await getReaderEligibility(user.id)).canRequest, true)
    await revokeConsent(user.id, 'privacidad', 'test')
    const privacy = (await getConsentStates(user.id)).find((s) => s.slug === 'privacidad')!
    assert.equal(privacy.result, 'revoked')
    await assert.rejects(requestLoan(user.id, bookId), (e: unknown) => isDomainError(e) && e.code === 'not_eligible')
    assert.equal((await verifyConsentChain()).ok, true)
  })
})

describe('Cookies', () => {
  it('sin elección, ninguna categoría opcional está permitida', () => {
    assert.equal(isAllowed(null, 'analytics'), false)
    assert.equal(isAllowed(parseChoice('basura'), 'analytics'), false)
  })

  it('rechazar o retirar desactiva las opcionales', () => {
    const accepted = parseChoice(serializeChoice({ preferences: true, analytics: true, advertising: false }))
    assert.equal(isAllowed(accepted, 'analytics'), true)
    assert.equal(isAllowed(accepted, 'advertising'), false)
    const withdrawn = parseChoice(serializeChoice({ preferences: false, analytics: false, advertising: false }))
    assert.equal(isAllowed(withdrawn, 'analytics'), false)
  })
})
