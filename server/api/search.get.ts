import {
  fetchOutbound,
  fetchInbound,
  fetchOutboundRange,
  groupReservableTrains,
  groupReservableByOrigin,
  groupReservableByDate,
} from '../utils/sncf'
import { buildCoordsIndex, lookupCoords, type CoordsIndex } from '../utils/stations'
import type { SearchResult, SearchMode } from '~~/shared/types'

let coordsIndex: CoordsIndex | null = null

async function getCoordsIndex(): Promise<CoordsIndex> {
  if (!coordsIndex) {
    try {
      const records = await useStorage('assets:server').getItem<any[]>('gares.json')
      coordsIndex = buildCoordsIndex(records || [])
    } catch {
      coordsIndex = new Map()
    }
  }
  return coordsIndex
}

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
