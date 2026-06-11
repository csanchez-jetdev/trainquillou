import type { SearchResult } from '~~/shared/types'

export function useSearch() {
  const route = useRoute()
  const router = useRouter()

  const origin = computed(() => (route.query.origin as string) || '')
  const date = computed(() => (route.query.date as string) || '')
  const hasQuery = computed(() => Boolean(origin.value && date.value))

  const { data, pending, error, refresh } = useFetch<SearchResult>('/api/search', {
    query: { origin, date },
    immediate: hasQuery.value,
    watch: [origin, date],
  })

  function search(params: { origin: string; date: string }) {
    router.push({ query: { origin: params.origin, date: params.date } })
  }

  return { origin, date, hasQuery, result: data, pending, error, refresh, search }
}
