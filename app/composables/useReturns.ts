import type { ReturnDatesResult } from '~~/shared/types'

export function useReturns() {
  const cache = reactive<Record<string, ReturnDatesResult>>({})
  const loading = ref<string | null>(null)
  const { push: toast } = useToasts()

  async function load(originOfReturn: string, destOfReturn: string, from: string) {
    const key = `${originOfReturn}|${destOfReturn}|${from}`
    if (cache[key]) return cache[key]
    loading.value = originOfReturn
    try {
      const res = await $fetch<ReturnDatesResult>('/api/returns', {
        query: { origin: originOfReturn, dest: destOfReturn, from },
      })
      cache[key] = res
      return res
    } catch {
      toast('Impossible de récupérer les dates de retour.', 'error')
      return null
    } finally {
      loading.value = null
    }
  }

  return { cache, loading, load }
}
