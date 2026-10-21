import type { SearchResult, SearchMode } from '~~/shared/types'
import { todayISO, nextWeekendISO } from '~~/shared/window'

type Mode = SearchMode | 'route'

export function useSearch() {
  const route = useRoute()
  const router = useRouter()

  const origin = computed(() => (route.query.origin as string) || '')
  const date = computed(() => (route.query.date as string) || '')
  const dateTo = computed(() => (route.query.dateTo as string) || '')
  const mode = computed<Mode>(() => {
    const m = route.query.mode
    return m === 'to' || m === 'range' || m === 'roundtrip' || m === 'route' ? m : 'from'
  })
  const needsDateTo = computed(() => mode.value === 'range' || mode.value === 'roundtrip')
  const hasQuery = computed(() => Boolean(origin.value && date.value))

  /**
   * The entry pages link here without a date — `/depuis/<gare>`, and the mode cards on the
   * landing page — and every fetch below needs one, so the search silently did nothing.
   *
   * Written into the URL rather than into a local ref: the URL is what the app reads back,
   * what a reload restores and what a shared link carries.
   */
  onMounted(() => {
    if (date.value && (!needsDateTo.value || dateTo.value)) return
    const query = { ...route.query }
    if (!needsDateTo.value) {
      query.date = todayISO()
    }
    else if (!date.value) {
      // Both ends missing: the weekend round trip the entry pages advertise.
      const [friday, sunday] = nextWeekendISO()
      query.date = friday
      query.dateTo = sunday
    }
    else {
      query.dateTo = date.value
    }
    router.replace({ query })
  })

  const { data, pending, error, refresh } = useAsyncData<SearchResult | null>(
    'search',
    () => {
      // Route mode is served by useItinerary, not by /api/search.
      if (mode.value === 'route') return Promise.resolve(null)
      if (!origin.value || !date.value) return Promise.resolve(null)
      if (needsDateTo.value && !dateTo.value) return Promise.resolve(null)
      return $fetch<SearchResult>('/api/search', {
        query: {
          origin: origin.value,
          date: date.value,
          mode: mode.value,
          ...(needsDateTo.value ? { dateTo: dateTo.value } : {}),
        },
      })
    },
    // Client-only: `/api/*` is the Django backend, reachable from the browser, not Nitro.
    { watch: [origin, date, dateTo, mode], server: false, lazy: true },
  )

  function search(params: {
    origin: string
    date: string
    dateTo?: string
    destination?: string
    stops?: string
    mode?: SearchMode | 'route'
  }) {
    const m = params.mode || 'from'
    const query: Record<string, string> = { origin: params.origin, date: params.date, mode: m }
    if ((m === 'range' || m === 'roundtrip') && params.dateTo) query.dateTo = params.dateTo
    if (m === 'route') {
      if (params.destination) query.destination = params.destination
      query.stops = params.stops || '1'
    }
    router.push({ query })
  }

  return { origin, date, dateTo, mode, hasQuery, result: data, pending, error, refresh, search }
}
