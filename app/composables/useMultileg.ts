import type { MultilegResult } from '~~/shared/types'

interface ApiError {
  detail?: string
  /** Stations the dataset does not name, echoed back by the backend. */
  unknown?: string[]
}

export function useMultileg() {
  const route = useRoute()
  const router = useRouter()

  const stops = computed(() =>
    ((route.query.stops as string) || '').split('|').map((s) => s.trim()).filter(Boolean),
  )
  const date = computed(() => (route.query.date as string) || '')
  const dateTo = computed(() => (route.query.dateTo as string) || '')
  const minStay = computed(() => (route.query.minStay as string) || '')
  const hasQuery = computed(() => stops.value.length >= 2 && Boolean(date.value))

  const { data, pending, error } = useAsyncData<MultilegResult | null>(
    'multileg',
    () => {
      if (!hasQuery.value) return Promise.resolve(null)
      return $fetch<MultilegResult>('/api/multileg', {
        query: {
          stops: stops.value.join('|'),
          date: date.value,
          ...(dateTo.value ? { dateTo: dateTo.value } : {}),
          ...(minStay.value ? { minStay: minStay.value } : {}),
        },
      })
    },
    { watch: [stops, date, dateTo, minStay], server: false, lazy: true },
  )

  const message = computed(() => {
    if (!error.value) return ''
    const body = error.value.data as ApiError | undefined
    if (body?.unknown?.length) {
      return `Gare inconnue du jeu de données : ${body.unknown.join(', ')}`
    }
    if (body?.detail) return body.detail
    return 'Le planificateur est momentanément indisponible.'
  })

  function plan(params: { stops: string[]; date: string; dateTo?: string; minStay?: number }) {
    const query: Record<string, string> = {
      stops: params.stops.filter(Boolean).join('|'),
      date: params.date,
    }
    if (params.dateTo) query.dateTo = params.dateTo
    if (params.minStay) query.minStay = String(params.minStay)
    router.push({ query })
  }

  return { stops, date, dateTo, minStay, hasQuery, result: data, pending, error, message, plan }
}
