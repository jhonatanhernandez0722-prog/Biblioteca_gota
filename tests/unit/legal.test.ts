import './setup'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isAllowed, parseChoice, serializeChoice } from '@/lib/cookie-consent'
import { LEGAL_DOCUMENTS } from '@/lib/legal'
import { getReaderEligibility, requestLoan } from '@/server/circulation'
import { createBook } from '@/server/catalog'
import { documentHash, getConsentStates, pendingConsents, recordConsent, revokeConsent, verifyConsentChain } from '@/server/consents'
import { get, getDb, run } from '@/server/db'
import { isDomainError } from '@/server/errors'
import { registerUser } from '@/server/users'

describe('Registro de aceptaciones', () => {
  it('el registro con aceptaciones guarda dos evidencias independientes con la versión vigente', async () => {
    const user = await registerUser({ name: 'Rita', email: 'rita@test.example', password: 'clave-segura-123', consents: { source: 'formulario:registro', requestId: 'req-1' } })
    const rows = getDb()
      .prepare('SELECT document_slug, document_version, document_hash, result, source, request_id, consent_type, recorded_at FROM consent_records WHERE user_id = ? ORDER BY id')
      .all(user.id) as Record<string, string>[]
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
    assert.deepEqual(pendingConsents(user.id), [])
  })

  it('no guarda contraseñas ni correos en las evidencias', () => {
    const columns = (getDb().prepare("SELECT name FROM pragma_table_info('consent_records')").all() as { name: string }[]).map((c) => c.name)
    for (const forbidden of ['email', 'password', 'password_hash', 'ip', 'user_agent']) assert.ok(!columns.includes(forbidden))
    const anyEmail = get<{ n: number }>("SELECT COUNT(*) AS n FROM consent_records WHERE subject_ref LIKE '%@%'")?.n
    assert.equal(anyEmail, 0)
  })

  it('las evidencias no se pueden modificar ni borrar', () => {
    assert.throws(() => run("UPDATE consent_records SET result = 'rejected'"), /no se pueden modificar/)
    assert.throws(() => run('DELETE FROM consent_records'), /no se pueden borrar/)
  })

  it('la cadena de hashes detecta una manipulación', () => {
    assert.equal(verifyConsentChain().ok, true)
    const db = getDb()
    db.exec('DROP TRIGGER consent_records_no_update')
    db.exec("UPDATE consent_records SET source = 'manipulado' WHERE id = 1")
    const result = verifyConsentChain()
    assert.equal(result.ok, false)
    assert.equal(result.brokenAt, 1)
    db.exec("UPDATE consent_records SET source = 'formulario:registro' WHERE id = 1")
    db.exec(`CREATE TRIGGER consent_records_no_update BEFORE UPDATE ON consent_records
             BEGIN SELECT RAISE(ABORT, 'Los registros de consentimiento no se pueden modificar'); END;`)
    assert.equal(verifyConsentChain().ok, true)
  })

  it('sin aceptaciones vigentes no se puede pedir libros; revocar tiene efecto real', async () => {
    const user = await registerUser({ name: 'Saúl', email: 'saul@test.example', password: 'clave-segura-123' })
    assert.deepEqual(pendingConsents(user.id), ['terminos', 'privacidad'])
    assert.equal(getReaderEligibility(user.id).canRequest, false)
    const { id: bookId } = createBook({ title: 'Libro legal', authors: ['X'], categories: [] }, user.id)
    // Aceptar solo los términos no autoriza el tratamiento: son independientes.
    recordConsent({ userId: user.id, slug: 'terminos', type: 'terms_acceptance', result: 'accepted', source: 'test' })
    assert.deepEqual(pendingConsents(user.id), ['privacidad'])
    recordConsent({ userId: user.id, slug: 'privacidad', type: 'data_processing_authorization', result: 'accepted', source: 'test' })
    assert.equal(getReaderEligibility(user.id).canRequest, true)
    revokeConsent(user.id, 'privacidad', 'test')
    const privacy = getConsentStates(user.id).find((s) => s.slug === 'privacidad')!
    assert.equal(privacy.result, 'revoked')
    assert.throws(() => requestLoan(user.id, bookId), (e: unknown) => isDomainError(e) && e.code === 'not_eligible')
    assert.equal(verifyConsentChain().ok, true)
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
