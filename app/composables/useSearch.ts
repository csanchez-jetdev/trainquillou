import type { SearchResult, SearchMode } from '~~/shared/types'

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
  /** Les modes qui exigent une seconde date : plage d'exploration, ou date de retour. */
  const needsDateTo = computed(() => mode.value === 'range' || mode.value === 'roundtrip')
  const hasQuery = computed(() => Boolean(origin.value && date.value))

  const { data, pending, error, refresh } = useAsyncData<SearchResult | null>(
    'search',
    () => {
      // Le mode itinéraire est servi par useItinerary, pas par /api/search.
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
    { watch: [origin, date, dateTo, mode] },
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
