import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Tipografías locales para las imágenes de compartir (Satori admite WOFF, no WOFF2). */
export async function ogFonts() {
  const dir = join(process.cwd(), 'src', 'fonts')
  const [serif, sans, sansBold] = await Promise.all([
    readFile(join(dir, 'dm-serif-display-400.woff')),
    readFile(join(dir, 'manrope-500.woff')),
    readFile(join(dir, 'manrope-700.woff')),
  ])
  return [
    { name: 'DM Serif Display', data: serif, weight: 400 as const, style: 'normal' as const },
    { name: 'Manrope', data: sans, weight: 500 as const, style: 'normal' as const },
    { name: 'Manrope', data: sansBold, weight: 700 as const, style: 'normal' as const },
  ]
}

export const OG_COLORS = {
  ink: '#16324F',
  ink2: '#244A68',
  water: '#56B8B0',
  paper: '#FAF8F2',
  mutedOnInk: '#C9D4E0',
}

/** La gota partida, como imagen SVG en data URI para Satori. */
export function dropMarkDataUri(ink = OG_COLORS.paper, water = OG_COLORS.water, spine = OG_COLORS.ink) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52"><path d="M20 1C20 1 2 21.5 2 33a18 18 0 0 0 18 18Z" fill="${ink}"/><path d="M20 1c0 0 18 20.5 18 32a18 18 0 0 1-18 18Z" fill="${water}"/><path d="M20 13.5V52" stroke="${spine}" stroke-width="2.6"/></svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}

export function ripplesDataUri(color = OG_COLORS.water) {
  const rings = [0, 1, 2, 3]
    .map((i) => {
      const t = (i + 1) / 4
      return `<ellipse cx="200" cy="60" rx="${60 + 140 * t}" ry="${14 + 44 * t}" fill="none" stroke="${color}" stroke-width="${3.2 - 1.6 * t}" stroke-opacity="${1 - 0.72 * t}"/>`
    })
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120">${rings}</svg>`
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
}
