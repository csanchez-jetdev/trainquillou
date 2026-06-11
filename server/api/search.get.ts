import { fetchOutbound, groupReservableTrains } from '../utils/sncf'
import { buildCoordsIndex, lookupCoords, type CoordsIndex } from '../utils/stations'
import type { SearchResult } from '~~/shared/types'

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
    const { origin, date } = getQuery(event) as { origin?: string; date?: string }
    if (!origin || !date) {
      throw createError({ statusCode: 400, statusMessage: 'origin and date are required' })
    }
    const index = await getCoordsIndex()
    const raw = await fetchOutbound(origin, date)
    const destinations = groupReservableTrains(raw).map((d) => ({
      ...d,
      coords: lookupCoords(index, d.label),
    }))
    return {
      origin: { label: origin, coords: lookupCoords(index, origin) },
      date,
      destinations,
    }
  },
  {
    maxAge: 60 * 10,
    name: 'search',
    getKey: (event) => {
      const q = getQuery(event)
      return `${q.origin}|${q.date}`
    },
  },
)
