import {
  fetchOutbound,
  fetchInbound,
  fetchOutboundRange,
  groupReservableTrains,
  groupReservableByOrigin,
  groupReservableByDate,
  groupRoundTrip,
} from '../utils/sncf'
import { lookupCoords } from '../utils/stations'
import { getCoordsIndex } from '../utils/coords'
import { lookupPopularity } from '../utils/popularity'
import { lookupBookingSlug } from '../utils/booking'
import type { SearchResult, SearchMode } from '~~/shared/types'

const MODES: SearchMode[] = ['from', 'to', 'range', 'roundtrip']

/** Les modes à deux dates : plage d'exploration, ou aller-retour. */
const NEEDS_SECOND_DATE: SearchMode[] = ['range', 'roundtrip']

export default defineCachedEventHandler(
  async (event): Promise<SearchResult> => {
    const q = getQuery(event) as { origin?: string; date?: string; dateTo?: string; mode?: SearchMode }
    const { origin, date } = q
    const mode: SearchMode = MODES.includes(q.mode as SearchMode) ? (q.mode as SearchMode) : 'from'

    if (!origin || !date) {
      throw createError({ statusCode: 400, statusMessage: 'origin and date are required' })
    }
    if (NEEDS_SECOND_DATE.includes(mode) && !q.dateTo) {
      throw createError({
        statusCode: 400,
        statusMessage: mode === 'roundtrip'
          ? 'dateTo (return date) is required in roundtrip mode'
          : 'dateTo is required in range mode',
      })
    }
    if (mode === 'roundtrip' && q.dateTo! < date) {
      throw createError({ statusCode: 400, statusMessage: 'return date must not precede outbound date' })
    }

    const index = await getCoordsIndex()

    let destinations
    if (mode === 'to') {
      destinations = groupReservableByOrigin(await fetchInbound(origin, date))
    } else if (mode === 'range') {
      destinations = groupReservableByDate(await fetchOutboundRange(origin, date, q.dateTo!))
    } else if (mode === 'roundtrip') {
      const [outbound, inbound] = await Promise.all([
        fetchOutbound(origin, date),
        fetchInbound(origin, q.dateTo!),
      ])
      destinations = groupRoundTrip(outbound, inbound)
    } else {
      destinations = groupReservableTrains(await fetchOutbound(origin, date))
    }

    const enriched = await Promise.all(
      destinations.map(async (d) => ({
        ...d,
        coords: lookupCoords(index, d.label),
        popularity: await lookupPopularity(d.label),
        slug: await lookupBookingSlug(d.label),
      })),
    )

    return {
      origin: {
        label: origin,
        coords: lookupCoords(index, origin),
        slug: await lookupBookingSlug(origin),
      },
      date,
      ...(NEEDS_SECOND_DATE.includes(mode) ? { dateTo: q.dateTo } : {}),
      mode,
      destinations: enriched,
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
