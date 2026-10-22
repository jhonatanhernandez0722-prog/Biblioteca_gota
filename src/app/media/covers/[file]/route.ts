import { getStorage, isValidStorageKey } from '@/server/integrations/storage'

/** Sirve portadas del almacenamiento privado. El nombre se valida antes de tocar el disco. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const key = `covers/${file}`
  if (!isValidStorageKey(key)) return new Response('No encontrado', { status: 404 })
  const data = await getStorage().read(key)
  if (!data) return new Response('No encontrado', { status: 404 })
  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  })
}
