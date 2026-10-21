import { todayISO } from '~~/shared/window'

/**
 * Custom events for Rybbit.
 *
 * `window.rybbit` only exists on a build carrying NUXT_PUBLIC_RYBBIT_SITE_ID (see
 * nuxt.config.ts): everywhere else — self-hosted instance, dev, SSR — this is a no-op, so no
 * call site has to guard.
 */
declare global {
  interface Window {
    rybbit?: { event: (name: string, props?: Record<string, string | number>) => void }
  }
}

export function track(name: string, props?: Record<string, string | number>): void {
  if (import.meta.client) window.rybbit?.event(name, props)
}

/**
 * Days between today and the date asked for.
 *
 * The axis that separates the two ways a search comes back empty: a liaison the network does
 * not run at all, and a day whose seats have not opened yet.
 */
export function horizonDays(date: string, now: string = todayISO()): number {
  const [y, m, d] = date.split('-').map(Number)
  const [ny, nm, nd] = now.split('-').map(Number)
  return Math.round((Date.UTC(y!, m! - 1, d!) - Date.UTC(ny!, nm! - 1, nd!)) / 86_400_000)
}
