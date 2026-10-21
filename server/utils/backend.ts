import type { H3Event } from 'h3'

/**
 * Read the Django API from the Nitro server.
 *
 * The client calls `/api/*` and the reverse proxy routes it to Django; Nitro is never in
 * that path, so the same relative URL would hit Nitro itself and 404. Server-rendered pages
 * therefore need the backend's own address.
 */
export function backendFetch<T>(event: H3Event, path: string, query?: Record<string, string>) {
  const { backendUrl } = useRuntimeConfig(event)
  return $fetch<T>(`${backendUrl}/api${path}`, { query })
}
