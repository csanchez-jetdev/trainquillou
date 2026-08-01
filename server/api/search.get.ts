import {
  fetchOutbound,
  fetchInbound,
  fetchOutboundRange,
  groupReservableTrains,
  groupReservableByOrigin,
  groupReservableByDate,
  groupRoundTrip,
} from '../utils/sncf'
import { lookupCoords, stationKey } from '../utils/stations'
import { clampToWindow, lastBookableISO } from '~~/shared/window'
import { getCoordsIndex } from '../utils/coords'
import { lookupPopularity } from '../utils/popularity'
import { lookupBookingSlug } from '../utils/booking'
import { parseDate, parseStation } from '../utils/params'
import type { SearchResult, SearchMode } from '~~/shared/types'

const MODES: SearchMode[] = ['from', 'to', 'range', 'roundtrip']

/** The two-date modes: range exploration, or round trip. */
const NEEDS_SECOND_DATE: SearchMode[] = ['range', 'roundtrip']

export default defineCachedEventHandler(
  async (event): Promise<SearchResult> => {
    const q = getQuery(event) as { origin?: string; date?: string; dateTo?: string; mode?: SearchMode }
    const origin = parseStation(q.origin)
    const date = parseDate(q.date)
    const requestedTo = parseDate(q.dateTo)
    const mode: SearchMode = MODES.includes(q.mode as SearchMode) ? (q.mode as SearchMode) : 'from'

    if (!origin || !date) {
      throw createError({
        statusCode: 400,
        statusMessage: 'origin (station label) and date (YYYY-MM-DD) are required',
      })
    }
    if (NEEDS_SECOND_DATE.includes(mode) && !requestedTo) {
      throw createError({
        statusCode: 400,
        statusMessage: mode === 'roundtrip'
          ? 'dateTo (return date, YYYY-MM-DD) is required in roundtrip mode'
          : 'dateTo (YYYY-MM-DD) is required in range mode',
      })
    }
    if (mode === 'roundtrip' && requestedTo! < date) {
      throw createError({ statusCode: 400, statusMessage: 'return date must not precede outbound date' })
    }

    // Free seats only open 30 days out; beyond that the dataset is empty. An unbounded range
    // would cost one upstream call per day for nothing — up to a hundred useless requests.
    if (date > lastBookableISO()) {
      throw createError({
        statusCode: 400,
        statusMessage: `date is beyond the 30-day booking window (last bookable: ${lastBookableISO()})`,
      })
    }
    const dateTo = requestedTo ? clampToWindow(requestedTo) : undefined

    const index = await getCoordsIndex()

    let destinations
    if (mode === 'to') {
      destinations = groupReservableByOrigin(await fetchInbound(origin, date))
    } else if (mode === 'range') {
      destinations = groupReservableByDate(await fetchOutboundRange(origin, date, dateTo!))
    } else if (mode === 'roundtrip') {
      const [outbound, inbound] = await Promise.all([
        fetchOutbound(origin, date),
        fetchInbound(origin, dateTo!),
      ])
      destinations = groupRoundTrip(outbound, inbound)
    } else {
      destinations = groupReservableTrains(await fetchOutbound(origin, date))
    }

    // The dataset links a city to itself when it has several stations: Lyon Part-Dieu →
    // Lyon Perrache both carry the label "LYON (intramuros)". A real train, but not a
    // destination.
    const hubKey = stationKey(origin)
    destinations = destinations.filter((d) => stationKey(d.label) !== hubKey)

    const enriched = await Promise.all(
      destinations.map(async (d) => ({
        ...d,
        coords: lookupCoords(index, d.label),
        popularity: await lookupPopularity(d.label),
        slug: lookupBookingSlug(d.label),
      })),
    )

    return {
      origin: {
        label: origin,
        coords: lookupCoords(index, origin),
        slug: lookupBookingSlug(origin),
      },
      date,
      // The clamped date, not the requested one: the client must reflect the range actually explored.
      ...(NEEDS_SECOND_DATE.includes(mode) ? { dateTo } : {}),
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
