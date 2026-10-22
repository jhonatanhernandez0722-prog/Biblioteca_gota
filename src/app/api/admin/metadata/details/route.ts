import { z } from 'zod'
import { apiError, json, limitApi, providerErrorResponse, requireStaffApi } from '@/server/api'
import { findPossibleDuplicates } from '@/server/catalog'
import { getMetadataProvider, isProviderId } from '@/server/integrations/metadata'

const querySchema = z.object({
  id: z.string().trim().min(3).max(40),
  provider: z.string().optional(),
})

/** Detalle de un resultado del proveedor, para revisarlo sin salir del formulario. */
export async function GET(request: Request) {
  const user = await requireStaffApi()
  if (user instanceof Response) return user
  const limited = limitApi(user, 'metadata-details', 60, 60_000)
  if (limited) return limited

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return apiError(400, 'invalid', 'Identificador no válido.')
  const providerId = parsed.data.provider && isProviderId(parsed.data.provider) ? parsed.data.provider : undefined
  const provider = getMetadataProvider(providerId)
  try {
    const details = await provider.getDetails(parsed.data.id)
    if (!details) return apiError(404, 'not_found', 'El proveedor ya no tiene esa ficha.')
    const duplicates = findPossibleDuplicates({ isbn: details.isbn13, title: details.title, authors: details.authors })
    return json({ details, duplicates, provider: provider.info })
  } catch (error) {
    return providerErrorResponse(error)
  }
}
