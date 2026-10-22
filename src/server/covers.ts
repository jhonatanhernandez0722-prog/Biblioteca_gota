import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { DomainError } from './errors'
import { getStorage } from './integrations/storage'

export const MAX_COVER_BYTES = 5 * 1024 * 1024
const MIN_COVER_WIDTH = 160

/** Hosts desde los que se pueden descargar portadas de proveedores (evita SSRF). */
const REMOTE_COVER_HOSTS = [
  /^covers\.openlibrary\.org$/,
  /^archive\.org$/,
  /^ia\d+\.us\.archive\.org$/,
  /^[a-z0-9-]+\.archive\.org$/,
  /^books\.google\.com$/,
  /^books\.googleusercontent\.com$/,
]

export function isAllowedCoverUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && REMOTE_COVER_HOSTS.some((re) => re.test(url.hostname))
  } catch {
    return false
  }
}

function detectImageType(data: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (data.length < 12) return null
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpeg'
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  return null
}

/**
 * Valida y normaliza una portada: comprueba el tipo real por sus bytes, la decodifica,
 * la reorienta, la limita a 800×1200 y la recodifica a JPEG sin metadatos.
 * Recodificar descarta cualquier contenido incrustado que no sea la imagen.
 */
export async function processCoverImage(input: Buffer): Promise<{ data: Buffer; color: string; isFlat: boolean }> {
  if (input.length === 0) throw new DomainError('El archivo está vacío.', 'empty_file')
  if (input.length > MAX_COVER_BYTES) {
    throw new DomainError('La imagen pesa más de 5 MB. Reduce su tamaño y vuelve a subirla.', 'too_large')
  }
  if (!detectImageType(input)) {
    throw new DomainError('Formato no admitido. Sube una imagen JPG, PNG o WebP.', 'bad_type')
  }
  const metadata = await sharp(input, { limitInputPixels: 40_000_000 })
    .metadata()
    .catch(() => {
      throw new DomainError('No se pudo leer la imagen. Puede estar dañada.', 'corrupt')
    })
  if (!metadata.width || !metadata.height || metadata.width < MIN_COVER_WIDTH) {
    throw new DomainError(`La imagen es demasiado pequeña (mínimo ${MIN_COVER_WIDTH} px de ancho).`, 'too_small')
  }
  const data = await sharp(input, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 800, height: 1200, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer()
  const { dominant, channels } = await sharp(data).stats()
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  // Algunas fichas de proveedores traen como «portada» una encuadernación lisa, sin título ni imagen.
  const isFlat = Math.max(...channels.slice(0, 3).map((c) => c.stdev)) < 14
  return { data, color: `#${hex(dominant.r)}${hex(dominant.g)}${hex(dominant.b)}`, isFlat }
}

export async function storeCover(
  input: Buffer,
  options: { rejectFlat?: boolean } = {},
): Promise<{ key: string; color: string }> {
  const { data, color, isFlat } = await processCoverImage(input)
  if (isFlat && options.rejectFlat) {
    throw new DomainError(
      'La portada del proveedor es una imagen lisa, sin título ni ilustración. Sube una a mano o deja la portada tipográfica.',
      'cover_flat',
    )
  }
  const key = `${randomUUID()}.jpg`
  await getStorage().put(`covers/${key}`, data)
  return { key, color }
}

export async function removeCover(key: string | null | undefined) {
  if (!key) return
  await getStorage()
    .remove(`covers/${key}`)
    .catch((error) => console.error('[portadas] No se pudo borrar', key, error))
}

/**
 * Descarga una portada de un proveedor externo. Solo HTTPS, solo hosts de la lista,
 * redirecciones revalidadas una a una, tiempo máximo y tamaño máximo.
 */
export async function fetchRemoteCover(initialUrl: string): Promise<Buffer> {
  let url = initialUrl
  for (let hop = 0; hop < 5; hop++) {
    if (!isAllowedCoverUrl(url)) {
      throw new DomainError('La portada viene de un dominio no permitido.', 'cover_host')
    }
    let response: Response
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(12_000),
        headers: { Accept: 'image/*' },
      })
    } catch {
      throw new DomainError('No se pudo descargar la portada del proveedor. Súbela a mano o inténtalo más tarde.', 'cover_fetch')
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) break
      url = new URL(location, url).toString()
      continue
    }
    if (response.status === 403 || response.status === 429) {
      throw new DomainError('El proveedor está limitando las descargas de portadas. Espera unos minutos o súbela a mano.', 'cover_rate_limited')
    }
    if (!response.ok || !response.body) {
      throw new DomainError('El proveedor no tiene esa portada disponible. Súbela a mano.', 'cover_missing')
    }
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > MAX_COVER_BYTES) throw new DomainError('La portada del proveedor pesa demasiado.', 'too_large')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let size = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_COVER_BYTES) {
        await reader.cancel()
        throw new DomainError('La portada del proveedor pesa demasiado.', 'too_large')
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks)
  }
  throw new DomainError('Demasiadas redirecciones al descargar la portada.', 'cover_redirects')
}
