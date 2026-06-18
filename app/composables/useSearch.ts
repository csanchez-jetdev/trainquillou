import type { SearchResult, SearchMode } from '~~/shared/types'

export function useSearch() {
  const route = useRoute()
  const router = useRouter()

  const origin = computed(() => (route.query.origin as string) || '')
  const date = computed(() => (route.query.date as string) || '')
  const dateTo = computed(() => (route.query.dateTo as string) || '')
  const mode = computed<SearchMode>(() => {
    const m = route.query.mode
    return m === 'to' || m === 'range' ? m : 'from'
  })
  const hasQuery = computed(() => Boolean(origin.value && date.value))

  const { data, pending, error, refresh } = useAsyncData<SearchResult | null>(
    'search',
    () => {
      if (!origin.value || !date.value) return Promise.resolve(null)
      if (mode.value === 'range' && !dateTo.value) return Promise.resolve(null)
      return $fetch<SearchResult>('/api/search', {
        query: {
          origin: origin.value,
          date: date.value,
          mode: mode.value,
          ...(mode.value === 'range' ? { dateTo: dateTo.value } : {}),
        },
      })
    },
    { watch: [origin, date, dateTo, mode] },
  )

  function search(params: { origin: string; date: string; dateTo?: string; mode?: SearchMode }) {
    const query: Record<string, string> = {
      origin: params.origin,
      date: params.date,
      mode: params.mode || 'from',
    }
    if (params.mode === 'range' && params.dateTo) query.dateTo = params.dateTo
    router.push({ query })
  }

  return { origin, date, dateTo, mode, hasQuery, result: data, pending, error, refresh, search }
}
