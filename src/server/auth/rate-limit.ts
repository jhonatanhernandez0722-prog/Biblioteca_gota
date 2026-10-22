/**
 * Limitador de intentos en memoria (ventana deslizante). Suficiente para una
 * sola instancia; con varias instancias habría que moverlo a Redis o a la base de datos.
 */
const buckets = new Map<string, number[]>()

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSeconds: number } {
  const now = Date.now()
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    buckets.set(key, recent)
    const retryAfterSeconds = Math.ceil((windowMs - (now - recent[0]!)) / 1000)
    return { ok: false, retryAfterSeconds }
  }
  recent.push(now)
  buckets.set(key, recent)
  if (buckets.size > 5000) {
    for (const [k, times] of buckets) {
      if (times.every((t) => now - t >= windowMs)) buckets.delete(k)
    }
  }
  return { ok: true, retryAfterSeconds: 0 }
}

export function resetRateLimit(key: string) {
  buckets.delete(key)
}
