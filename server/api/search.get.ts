import {
  fetchOutbound,
  fetchInbound,
  fetchOutboundRange,
  groupReservableTrains,
  groupReservableByOrigin,
  groupReservableByDate,
} from '../utils/sncf'
import { lookupCoords } from '../utils/stations'
import { getCoordsIndex } from '../utils/coords'
import type { SearchResult, SearchMode } from '~~/shared/types'

export default defineCachedEventHandler(
  async (event): Promise<SearchResult> => {
    const q = getQuery(event) as { origin?: string; date?: string; dateTo?: string; mode?: SearchMode }
    const { origin, date } = q
    const mode: SearchMode = q.mode === 'to' || q.mode === 'range' ? q.mode : 'from'

    if (!origin || !date) {
      throw createError({ statusCode: 400, statusMessage: 'origin and date are required' })
    }
    if (mode === 'range' && !q.dateTo) {
      throw createError({ statusCode: 400, statusMessage: 'dateTo is required in range mode' })
    }

    const index = await getCoordsIndex()

    let destinations
    if (mode === 'to') {
      destinations = groupReservableByOrigin(await fetchInbound(origin, date))
    } else if (mode === 'range') {
      destinations = groupReservableByDate(await fetchOutboundRange(origin, date, q.dateTo!))
    } else {
      destinations = groupReservableTrains(await fetchOutbound(origin, date))
    }

    return {
      origin: { label: origin, coords: lookupCoords(index, origin) },
      date,
      ...(mode === 'range' ? { dateTo: q.dateTo } : {}),
      mode,
      destinations: destinations.map((d) => ({ ...d, coords: lookupCoords(index, d.label) })),
    }
  },
  {
    maxAge: 60 * 10,
    name: 'search',
    getKey: (event) => {
      const q = getQuery(event)
      return `${q.mode || 'from'}|${q.origin}|${q.date}|${q.dateTo || ''}`
    },
  },
)
