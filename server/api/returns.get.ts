import { fetchReturnDates } from '../utils/sncf'
import type { ReturnDatesResult } from '~~/shared/types'

export default defineCachedEventHandler(
  async (event): Promise<ReturnDatesResult> => {
    const { origin, dest, from } = getQuery(event) as { origin?: string; dest?: string; from?: string }
    if (!origin || !dest || !from) {
      throw createError({ statusCode: 400, statusMessage: 'origin, dest and from are required' })
    }
    const dates = await fetchReturnDates(origin, dest, from)
    return { origin, destination: dest, dates }
  },
  {
    maxAge: 60 * 10,
    name: 'returns',
    getKey: (event) => {
      const q = getQuery(event)
      return `${q.origin}|${q.dest}|${q.from}`
    },
  },
)
