import { z } from 'zod'
import { apiError, json, limitApi, providerErrorResponse, requireStaffApi } from '@/server/api'
import { findPossibleDuplicates } from '@/server/catalog'
import { getMetadataProvider, isProviderId } from '@/server/integrations/metadata'

const querySchema = z.object({
  q: z.string().trim().min(2, 'Escribe al menos 2 caracteres.').max(120),
  mode: z.enum(['auto', 'isbn', 'title', 'author']).default('auto'),
  provider: z.string().optional(),
  page: z.coerce.number().int().min(1).max(20).default(1),
})

/** Búsqueda en el proveedor de metadatos (solo personal). Marca lo que ya está en el catálogo. */
export async function GET(request: Request) {
  const user = await requireStaffApi()
  if (user instanceof Response) return user
  const limited = limitApi(user, 'metadata-search', 40, 60_000)
  if (limited) return limited

  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = querySchema.safeParse(params)
  if (!parsed.success) return apiError(400, 'invalid', parsed.error.issues[0]?.message ?? 'Consulta no válida.')

  const providerId = parsed.data.provider && isProviderId(parsed.data.provider) ? parsed.data.provider : undefined
  const provider = getMetadataProvider(providerId)
  if (!provider.info.configured) {
    return apiError(501, 'not_configured', `${provider.info.label} no está configurado en el servidor.`)
  }
  try {
    const page = await provider.search({ q: parsed.data.q, mode: parsed.data.mode, page: parsed.data.page })
    const items = await Promise.all(page.items.map(async (item) => {
      const match = item.isbn13 ? (await findPossibleDuplicates({ isbn: item.isbn13 })).exact[0] : undefined
      return { ...item, inCatalog: match ? { id: match.id, slug: match.slug, title: match.title } : null }
    }))
    return json({ ...page, items, provider: provider.info })
  } catch (error) {
    return providerErrorResponse(error)
  }
}
