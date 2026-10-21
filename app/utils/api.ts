/**
 * Base URL of the Django API.
 *
 * Relative in the browser, where the reverse proxy routes `/api/*` to Django. Absolute on
 * the server, which is not in that path and would answer its own 404.
 */
export function apiBase(): string {
  return import.meta.server ? `${useRuntimeConfig().backendUrl}/api` : '/api'
}
