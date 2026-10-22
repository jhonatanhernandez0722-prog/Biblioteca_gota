import Link from 'next/link'

function pagesToShow(page: number, pageCount: number): (number | 'gap')[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1])
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b)
  const result: (number | 'gap')[] = []
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) result.push('gap')
    result.push(p)
  })
  return result
}

/** Paginación con enlaces reales (funciona sin JavaScript y conserva los filtros en la URL). */
export function Pagination({
  page,
  pageCount,
  basePath,
  params,
}: {
  page: number
  pageCount: number
  basePath: string
  params: Record<string, string | undefined>
}) {
  if (pageCount <= 1) return null
  const href = (p: number) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
    if (p > 1) search.set('pagina', String(p))
    else search.delete('pagina')
    const qs = search.toString()
    return qs ? `${basePath}?${qs}` : basePath
  }
  return (
    <nav className="pagination" aria-label="Paginación">
      {page > 1 ? (
        <Link href={href(page - 1)} rel="prev">
          Anterior
        </Link>
      ) : null}
      {pagesToShow(page, pageCount).map((p, i) =>
        p === 'gap' ? (
          <span key={`gap-${i}`} className="gap" aria-hidden="true">
            …
          </span>
        ) : p === page ? (
          <span key={p} aria-current="page">
            {p}
          </span>
        ) : (
          <Link key={p} href={href(p)} aria-label={`Página ${p}`}>
            {p}
          </Link>
        ),
      )}
      {page < pageCount ? (
        <Link href={href(page + 1)} rel="next">
          Siguiente
        </Link>
      ) : null}
    </nav>
  )
}
