import { z } from 'zod'
import { json, limitApi, requireStaffApi } from '@/server/api'
import { findPossibleDuplicates } from '@/server/catalog'

const querySchema = z.object({
  isbn: z.string().max(20).optional(),
  title: z.string().max(300).optional(),
  authors: z.string().max(1200).optional(),
  excludeId: z.coerce.number().int().positive().optional(),
})

/** Comprobación en vivo de duplicados mientras se rellena una ficha. */
export async function GET(request: Request) {
  const user = await requireStaffApi()
  if (user instanceof Response) return user
  const limited = limitApi(user, 'duplicates', 120, 60_000)
  if (limited) return limited
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) return json({ exact: [], similar: [] })
  const { isbn, title, authors, excludeId } = parsed.data
  return json(
    await findPossibleDuplicates({
      isbn,
      title,
      authors: authors?.split(/\n|;/).map((a) => a.trim()).filter(Boolean),
      excludeId,
    }),
  )
}
