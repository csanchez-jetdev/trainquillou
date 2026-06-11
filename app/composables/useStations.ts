import { cleanString } from '~~/server/utils/normalize'

export function useStations() {
  const { data: stations } = useFetch<string[]>('/api/stations', {
    key: 'stations',
    default: () => [] as string[],
    server: false,
  })

  function suggest(input: string, limit = 8): string[] {
    const q = cleanString(input)
    if (q.length < 1) return []
    const list = stations.value || []
    const starts: string[] = []
    const contains: string[] = []
    for (const s of list) {
      const c = cleanString(s)
      if (c.startsWith(q)) starts.push(s)
      else if (c.includes(q)) contains.push(s)
      if (starts.length >= limit) break
    }
    return [...starts, ...contains].slice(0, limit)
  }

  return { stations, suggest }
}
