/**
 * Capturas de página completa en varios anchos para revisar el diseño.
 *
 *   npx tsx scripts/screenshots.ts / /explorar /libros/rayuela-cortazar
 *   WIDTHS=1440,390 LOGIN=lector@gotagota.example:LectorGota-2026 npx tsx scripts/screenshots.ts /cuenta
 *
 * Usa el Chrome o Edge instalado (playwright-core no descarga navegadores).
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium, type Browser } from 'playwright-core'

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean) as string[]

export async function launchBrowser(): Promise<Browser> {
  const executablePath = CANDIDATES.find((p) => fs.existsSync(p))
  if (!executablePath) throw new Error('No se encontró Chrome ni Edge. Define CHROME_PATH.')
  return chromium.launch({ executablePath })
}

function fileName(route: string, width: number) {
  const slug = route.replace(/^\//, '').replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '') || 'inicio'
  return `${slug}-${width}.png`
}

async function main() {
  const base = process.env.BASE_URL ?? 'http://localhost:3000'
  const routes = process.argv.slice(2)
  if (!routes.length) routes.push('/')
  const widths = (process.env.WIDTHS ?? '1440,768,390').split(',').map(Number)
  const outDir = path.join(process.cwd(), '.verify', 'screens')
  fs.mkdirSync(outDir, { recursive: true })

  const browser = await launchBrowser()
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: width < 600 ? 844 : 900 },
      reducedMotion: process.env.MOTION === '1' ? 'no-preference' : 'reduce',
      locale: 'es-CO',
    })
    const page = await context.newPage()
    if (process.env.LOGIN) {
      const [email, password] = process.env.LOGIN.split(':')
      await page.goto(`${base}/entrar`)
      await page.fill('input[name="email"]', email!)
      await page.fill('input[name="password"]', password!)
      await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/entrar')), page.click('button[type="submit"]')])
    }
    for (const route of routes) {
      const response = await page.goto(`${base}${route}`, { waitUntil: 'networkidle' })
      // Recorre la página para que carguen las imágenes diferidas antes de capturar.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += window.innerHeight * 0.8) {
          window.scrollTo(0, y)
          await new Promise((r) => setTimeout(r, 120))
        }
        window.scrollTo(0, 0)
      })
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(400)
      const file = path.join(outDir, fileName(route, width))
      await page.screenshot({ path: file, fullPage: true })
      console.log(`${response?.status()} ${route} @${width} → ${path.relative(process.cwd(), file)}`)
      if (process.env.SEGMENTS) {
        // Tramos del alto de la pantalla: legibles al revisarlos uno a uno.
        const sharp = (await import('sharp')).default
        const { height = 0 } = await sharp(file).metadata()
        const tile = page.viewportSize()!.height
        for (let top = 0, i = 1; top < height; top += tile, i++) {
          const tileFile = file.replace(/\.png$/, `-${String(i).padStart(2, '0')}.png`)
          await sharp(file)
            .extract({ left: 0, top, width, height: Math.min(tile, height - top) })
            .toFile(tileFile)
        }
      }
    }
    await context.close()
  }
  await browser.close()
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
