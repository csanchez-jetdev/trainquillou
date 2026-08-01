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
