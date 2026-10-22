import './setup'
import assert from 'node:assert/strict'
import { it } from 'node:test'
import { get } from '@/server/db'

it('ignora el controlador SQLite almacenado por la versión anterior', async () => {
  const legacyGlobal = globalThis as typeof globalThis & { __gotaGotaDb?: Promise<unknown> }
  legacyGlobal.__gotaGotaDb = Promise.resolve({ prepare: () => undefined })

  assert.deepEqual(await get<{ result: number }>('SELECT 1 AS result'), { result: 1 })
})
