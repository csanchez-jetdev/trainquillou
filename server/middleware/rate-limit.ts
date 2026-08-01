/**
 * Per-address budget on the API routes.
 *
 * One call fans out into several upstream requests, so an unthrottled caller turns this server
 * into an amplifier pointed at data.sncf.com, and gets its address throttled there for everyone.
 *
 * In memory, therefore per process. Sharing the counters across several would take an external
 * store, which such a deployment needs anyway.
 */
const WINDOW_MS = 60_000
/** Budget per window and per address, in cost units. */
const BUDGET = 60
/** Cost of a call, where it is not 1. Itineraries fan out the most. */
const COST: Record<string, number> = { '/api/route': 5 }
/** Addresses tracked at once. Past that the table is dropped: a reset costs one free window. */
const MAX_TRACKED = 20_000

const buckets = new Map<string, { used: number; resetAt: number }>()

export default defineEventHandler((event) => {
  const path = event.path.split('?')[0]!
  if (!path.startsWith('/api/')) return

  // h3 reads the first X-Forwarded-For entry, so this holds only where the proxy in front
  // replaces that header with the real peer instead of appending to what the client sent.
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  const cost = COST[path] ?? 1
  const now = Date.now()
  const bucket = buckets.get(ip)

  if (!bucket || now >= bucket.resetAt) {
    if (buckets.size >= MAX_TRACKED) buckets.clear()
    buckets.set(ip, { used: cost, resetAt: now + WINDOW_MS })
    return
  }

  bucket.used += cost
  if (bucket.used > BUDGET) {
    setResponseHeader(event, 'retry-after', Math.ceil((bucket.resetAt - now) / 1000))
    throw createError({ statusCode: 429, statusMessage: 'too many requests' })
  }
})
