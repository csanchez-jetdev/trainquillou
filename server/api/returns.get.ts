import { fetchReturnDates } from '../utils/sncf'
import { parseDate, parseStation } from '../utils/params'
import type { ReturnDatesResult } from '~~/shared/types'

export default defineCachedEventHandler(
  async (event): Promise<ReturnDatesResult> => {
    const q = getQuery(event) as { origin?: string; dest?: string; from?: string }
    const origin = parseStation(q.origin)
    const dest = parseStation(q.dest)
    const from = parseDate(q.from)
    if (!origin || !dest || !from) {
      throw createError({
        statusCode: 400,
        statusMessage: 'origin and dest (station labels) and from (YYYY-MM-DD) are required',
      })
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
