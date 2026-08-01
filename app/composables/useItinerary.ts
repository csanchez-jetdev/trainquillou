import type { RouteResult } from '~~/shared/types'

type RouteData = RouteResult & { truncated: boolean }

/** Multi-hop A → B itinerary search, driven by the URL (?mode=route&origin=&destination=&date=&stops=). */
export function useItinerary() {
  const route = useRoute()

  const from = computed(() => (route.query.origin as string) || '')
  const to = computed(() => (route.query.destination as string) || '')
  const date = computed(() => (route.query.date as string) || '')
  const stops = computed(() => (route.query.stops as string) || '2')
  const active = computed(() => route.query.mode === 'route')

  const { data, pending, error, refresh } = useAsyncData<RouteData | null>(
    'itinerary',
    () => {
      if (!active.value || !from.value || !to.value || !date.value) return Promise.resolve(null)
      return $fetch<RouteData>('/api/route', {
        query: { from: from.value, to: to.value, date: date.value, stops: stops.value },
      })
    },
    // Client-only and non-blocking: graph exploration can be slow, so show the page with
    // its skeleton right away rather than block SSR.
    { watch: [from, to, date, stops, active], server: false, lazy: true },
  )

  return { from, to, date, stops, active, route: data, pending, error, refresh }
}
