/**
 * Prueba de extremo a extremo con un navegador real (Chrome/Edge instalado).
 *
 *   1. DATABASE_PATH=./data/e2e.db STORAGE_DIR=./.verify/storage-e2e npm run db:seed -- --reset --offline
 *   2. npm run build && (mismas variables) npx next start -p 3100
 *   3. E2E_BASE_URL=http://localhost:3100 DATABASE_PATH=./data/e2e.db npm run e2e
 *
 * Cada paso informa de si pasó o falló. La importación necesita red (Open Library):
 * si no hay conexión, ese paso se marca como omitido, nunca como superado.
 */
import path from 'node:path'
import type { Page } from 'playwright-core'
import { launchBrowser } from './screenshots'

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:3100'
const DB = process.env.DATABASE_PATH ?? './data/e2e.db'
const results: { name: string; status: 'ok' | 'fail' | 'skip'; detail?: string }[] = []

async function step(name: string, fn: () => Promise<void | 'skip'>) {
  try {
    const outcome = await fn()
    results.push({ name, status: outcome === 'skip' ? 'skip' : 'ok' })
    console.log(`${outcome === 'skip' ? '○' : '✓'} ${name}`)
  } catch (error) {
    results.push({ name, status: 'fail', detail: (error as Error).message.split('\n')[0] })
    console.log(`✗ ${name}\n    ${(error as Error).message.split('\n')[0]}`)
  }
}

function expect(condition: unknown, message: string) {
  if (!condition) throw new Error(message)
}

function query<T>(sql: string, params: (string | number)[] = []): T[] {
  const sqlite = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite')
  const db = new sqlite.DatabaseSync(path.resolve(DB))
  try {
    return db.prepare(sql).all(...params) as unknown as T[]
  } finally {
    db.close()
  }
}

async function toastText(page: Page): Promise<string> {
  const toast = page.locator('.toast').last()
  await toast.waitFor({ timeout: 10_000 })
  return (await toast.innerText()).trim()
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/entrar`)
  await page.getByLabel('Correo electrónico').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith('/entrar')), page.getByRole('button', { name: 'Entrar', exact: true }).click()])
}

async function logout(page: Page) {
  await page.context().clearCookies()
}

async function main() {
  const browser = await launchBrowser()
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'es-CO' })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  const stamp = Date.now().toString(36)
  const reader = { name: 'Persona de Prueba', email: `e2e-${stamp}@test.example`, password: 'una-clave-de-prueba' }
  const available = query<{ slug: string; title: string; id: number }>(
    `SELECT b.slug, b.title, b.id FROM books b WHERE b.status = 'active'
       AND (SELECT COUNT(*) FROM copies c WHERE c.book_id = b.id AND c.status = 'available')
         > (SELECT COUNT(*) FROM loans l WHERE l.book_id = b.id AND l.status = 'pending')
     ORDER BY b.title LIMIT 1`,
  )[0]
  const unavailable = query<{ slug: string; title: string }>(
    `SELECT b.slug, b.title FROM books b WHERE b.status = 'active'
       AND (SELECT COUNT(*) FROM copies c WHERE c.book_id = b.id AND c.status NOT IN ('lost','withdrawn')) > 0
       AND (SELECT COUNT(*) FROM copies c WHERE c.book_id = b.id AND c.status = 'available') = 0 LIMIT 1`,
  )[0]

  /* ───── Público ───── */
  await step('La portada carga con su titular y el buscador', async () => {
    await page.goto(BASE)
    expect((await page.locator('h1').innerText()).includes('Cada libro'), 'Falta el titular')
    await page.getByLabel('Buscar por título, autor, tema o ISBN').fill('borges')
    await Promise.all([page.waitForURL(/\/explorar\?q=borges/), page.getByRole('button', { name: 'Buscar', exact: true }).click()])
    expect(/resultado/.test(await page.locator('#resultados').innerText()), 'No muestra el recuento de resultados')
    expect((await page.locator('article').count()) > 0, 'La búsqueda «borges» no devolvió libros')
  })

  await step('Los filtros del catálogo se reflejan en la URL', async () => {
    await page.goto(`${BASE}/explorar`)
    await page.getByLabel('Disponibles ahora').check()
    await page.waitForURL(/disponibilidad=disponible/)
    expect(!page.url().includes('categoria='), 'La URL arrastra parámetros vacíos')
    expect((await page.getByRole('link', { name: /Quitar filtro Disponibles ahora/ }).count()) === 1, 'Falta el filtro activo')
  })

  await step('Una búsqueda sin resultados explica qué hacer', async () => {
    await page.goto(`${BASE}/explorar?q=zzqxy`)
    expect((await page.getByText('No encontramos libros para «zzqxy»').count()) === 1, 'Falta el estado vacío')
  })

  await step('Sin sesión, la ficha invita a entrar para pedir el libro', async () => {
    await page.goto(`${BASE}/libros/${available!.slug}`)
    expect((await page.getByRole('link', { name: 'Entra para pedirlo' }).count()) === 1, 'Falta la llamada a entrar')
  })

  await step('Las zonas privadas redirigen al acceso y la API exige sesión', async () => {
    await page.goto(`${BASE}/cuenta`)
    expect(page.url().includes('/entrar?siguiente=%2Fcuenta'), `URL inesperada: ${page.url()}`)
    const api = await page.request.get(`${BASE}/api/admin/metadata/search?q=rayuela`)
    expect(api.status() === 401, `La API respondió ${api.status()} sin sesión`)
  })

  /* ───── Registro y préstamo ───── */
  await step('El registro valida y conserva lo escrito', async () => {
    await page.goto(`${BASE}/registro`)
    await page.getByLabel('Nombre y apellido').fill(reader.name)
    await page.getByLabel('Correo electrónico').fill(reader.email)
    await page.locator('input[name="password"]').fill(reader.password)
    await page.locator('input[name="confirm"]').fill('otra-cosa-distinta')
    await page.getByRole('button', { name: 'Crear cuenta' }).click()
    await page.getByText('Las contraseñas no coinciden.').waitFor()
    expect((await page.getByLabel('Correo electrónico').inputValue()) === reader.email, 'Se perdió el correo tras el error')
  })

  await step('Crear cuenta inicia sesión y da la bienvenida', async () => {
    await page.locator('input[name="password"]').fill(reader.password)
    await page.locator('input[name="confirm"]').fill(reader.password)
    await page.locator('input[name="terms"]').check()
    await Promise.all([page.waitForURL(/\/cuenta$/), page.getByRole('button', { name: 'Crear cuenta' }).click()])
    expect((await toastText(page)).includes('Te damos la bienvenida'), 'Falta el aviso de bienvenida')
  })

  await step('Solicitar un préstamo desde la ficha', async () => {
    await page.goto(`${BASE}/libros/${available!.slug}`)
    await page.getByRole('button', { name: 'Solicitar préstamo' }).click()
    expect((await toastText(page)).includes('Solicitud enviada'), 'Falta la confirmación')
    await page.getByText(/Pediste este libro el/).waitFor()
  })

  await step('Reservar un libro sin ejemplares libres', async () => {
    if (!unavailable) return 'skip'
    await page.goto(`${BASE}/libros/${unavailable.slug}`)
    await page.getByRole('button', { name: 'Reservar' }).click()
    expect((await toastText(page)).includes('Reserva hecha'), 'Falta la confirmación de la reserva')
  })

  await step('Mi cuenta muestra la solicitud y la reserva', async () => {
    await page.goto(`${BASE}/cuenta`)
    expect((await page.getByRole('heading', { name: 'Solicitudes pendientes' }).count()) === 1, 'Falta la solicitud')
    if (unavailable) expect((await page.getByRole('heading', { name: 'En lista de espera' }).count()) === 1, 'Falta la reserva')
  })

  await step('Un lector no ve el panel ni puede usar su API', async () => {
    const response = await page.goto(`${BASE}/admin`)
    expect(response?.status() === 404, `El panel respondió ${response?.status()} a un lector`)
    const api = await page.request.get(`${BASE}/api/admin/metadata/search?q=rayuela`)
    expect(api.status() === 403, `La API respondió ${api.status()} a un lector`)
  })

  /* ───── Personal de biblioteca ───── */
  await step('Credenciales erróneas muestran un error claro', async () => {
    await logout(page)
    await page.goto(`${BASE}/entrar`)
    await page.getByLabel('Correo electrónico').fill('biblioteca@gotagota.example')
    await page.locator('input[name="password"]').fill('no-es-esta')
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await page.getByText('El correo o la contraseña no coinciden').waitFor()
  })

  await step('El bibliotecario entra directo al panel', async () => {
    await login(page, 'biblioteca@gotagota.example', 'BibliotecaGota-2026')
    expect(new URL(page.url()).pathname === '/admin', `Entró a ${page.url()}`)
    await page.getByRole('heading', { name: 'Solicitudes por atender' }).waitFor()
  })

  await step('Aprobar, entregar y registrar la devolución', async () => {
    await page.goto(`${BASE}/admin/prestamos?vista=solicitudes&q=${encodeURIComponent(reader.email)}`)
    await page.getByRole('button', { name: 'Aprobar' }).first().click()
    expect((await toastText(page)).includes('Solicitud aprobada'), 'No se aprobó')
    await page.goto(`${BASE}/admin/prestamos?vista=recoger&q=${encodeURIComponent(reader.email)}`)
    await page.getByRole('button', { name: 'Entregar', exact: true }).first().click()
    expect((await toastText(page)).includes('Entregado'), 'No se entregó')
    await page.goto(`${BASE}/admin/prestamos?vista=activos&q=${encodeURIComponent(reader.email)}`)
    await page.getByRole('button', { name: 'Registrar devolución' }).first().click()
    await page.locator('dialog[open]').getByRole('button', { name: 'Registrar devolución' }).click()
    expect((await toastText(page)).includes('Devolución registrada'), 'No se registró la devolución')
  })

  await step('Importar un libro real desde Open Library por ISBN', async () => {
    await page.goto(`${BASE}/admin/libros/importar`)
    await page.getByLabel('ISBN, título o autor').fill('9788437604572')
    await page.getByRole('button', { name: 'Buscar', exact: true }).click()
    const outcome = await Promise.race([
      page.getByRole('button', { name: 'Ver detalles' }).first().waitFor({ timeout: 25_000 }).then(() => 'ok' as const),
      page.locator('.alert--danger').first().waitFor({ timeout: 25_000 }).then(() => 'error' as const),
    ]).catch(() => 'timeout' as const)
    if (outcome !== 'ok') {
      console.log('    (sin respuesta de Open Library: se omite la importación)')
      return 'skip'
    }
    await page.getByRole('button', { name: 'Ver detalles' }).first().click()
    await page.locator('dialog[open]').getByRole('button', { name: 'Usar estos datos' }).click({ timeout: 25_000 })
    const title = page.locator('input[name="title"]')
    await title.waitFor()
    expect((await title.inputValue()).length > 0, 'El formulario no se rellenó')
    const confirm = page.locator('input[name="confirmDuplicate"]')
    await page.waitForTimeout(800)
    if (await confirm.count()) await confirm.check()
    await Promise.all([
      page.waitForURL(/\/admin\/libros\/\d+$/, { timeout: 40_000 }),
      page.getByRole('button', { name: 'Guardar en el catálogo' }).click(),
    ])
    expect((await toastText(page)).includes('ya está en el catálogo'), 'Falta la confirmación de importación')
  })

  await step('Un ISBN ya importado aparece como «Ya en el catálogo»', async () => {
    const imported = query<{ n: number }>(`SELECT COUNT(*) AS n FROM books WHERE isbn13 = '9788437604572'`)[0]?.n ?? 0
    if (!imported) return 'skip'
    await page.goto(`${BASE}/admin/libros/importar?q=9788437604572`)
    await page.getByText('Ya en el catálogo').first().waitFor({ timeout: 25_000 })
  })

  /* ───── Administración ───── */
  await step('La administración suspende una cuenta y esta ya no puede entrar', async () => {
    await logout(page)
    await login(page, 'admin@gotagota.example', 'AdminGota-2026')
    const user = query<{ id: number }>('SELECT id FROM users WHERE email = ?', [reader.email])[0]
    await page.goto(`${BASE}/admin/usuarios/${user!.id}`)
    await page.getByRole('button', { name: 'Suspender cuenta' }).click()
    await page.locator('dialog[open]').getByRole('button', { name: 'Suspender', exact: true }).click()
    expect((await toastText(page)).includes('Cuenta suspendida'), 'No se suspendió')
    await logout(page)
    await page.goto(`${BASE}/entrar`)
    await page.getByLabel('Correo electrónico').fill(reader.email)
    await page.locator('input[name="password"]').fill(reader.password)
    await page.getByRole('button', { name: 'Entrar', exact: true }).click()
    await page.getByText('Tu cuenta está suspendida').waitFor()
  })

  /* ───── Móvil ───── */
  await step('En el móvil, el menú se abre, atrapa el foco y se cierra con Escape', async () => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-CO', isMobile: true, hasTouch: true })
    const m = await mobile.newPage()
    await m.goto(BASE)
    const toggle = m.getByRole('button', { name: 'Menú' })
    await toggle.click()
    await m.getByRole('navigation', { name: 'Principal (móvil)' }).getByRole('link', { name: 'Explorar libros' }).waitFor()
    await m.keyboard.press('Escape')
    expect((await toggle.getAttribute('aria-expanded')) === 'false', 'El menú no se cerró')
    const overflow = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow <= 0, `Hay desplazamiento horizontal de ${overflow}px`)
    await mobile.close()
  })

  await step('Sin errores de JavaScript en el navegador', async () => {
    expect(errors.length === 0, `Errores: ${errors.join(' | ')}`)
  })

  await browser.close()
  const failed = results.filter((r) => r.status === 'fail').length
  const skipped = results.filter((r) => r.status === 'skip').length
  console.log(`\n${results.length - failed - skipped} superadas, ${failed} fallidas, ${skipped} omitidas`)
  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
