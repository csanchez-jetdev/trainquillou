import { findItineraries, feasibleNextDays } from '../utils/routing'
import { lookupCoords } from '../utils/stations'
import { getCoordsIndex } from '../utils/coords'
import type { RouteResult } from '~~/shared/types'

export default defineCachedEventHandler(
  async (event): Promise<RouteResult & { truncated: boolean }> => {
    const q = getQuery(event) as { from?: string; to?: string; date?: string; stops?: string }
    const { from, to, date } = q
    if (!from || !to || !date) {
      throw createError({ statusCode: 400, statusMessage: 'from, to and date are required' })
    }
    const maxStops = Math.max(0, Math.min(3, Number(q.stops ?? 2) || 0))

    const index = await getCoordsIndex()
    const [{ itineraries, truncated }, alsoAvailable] = await Promise.all([
      findItineraries(from, to, date, maxStops),
      feasibleNextDays(from, to, date, 3),
    ])

    // Enrichissement des coordonnées de chaque leg
    const enriched = itineraries.map((it) => ({
      ...it,
      legs: it.legs.map((l) => ({
        ...l,
        fromCoords: lookupCoords(index, l.from),
        toCoords: lookupCoords(index, l.to),
      })),
    }))

    return {
      from: { label: from, coords: lookupCoords(index, from) },
      to: { label: to, coords: lookupCoords(index, to) },
      date,
      maxStops,
      itineraries: enriched,
      alsoAvailable,
      truncated,
    }
  },
  {
    maxAge: 60 * 10,
    name: 'route',
    getKey: (event) => {
      const q = getQuery(event)
      return `${q.from}|${q.to}|${q.date}|${q.stops || 1}`
    },
  },
)
