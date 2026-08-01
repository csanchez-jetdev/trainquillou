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

    // Les places à 0 € n'ouvrent que 30 jours avant le départ : au-delà, le dataset SNCF
    // est vide. Une plage non bornée demanderait un appel amont par jour pour rien —
    // jusqu'à cent requêtes inutiles sur l'API publique.
    if (date > lastBookableISO()) {
      throw createError({
        statusCode: 400,
        statusMessage: `date is beyond the 30-day booking window (last bookable: ${lastBookableISO()})`,
      })
    }
    const dateTo = q.dateTo ? clampToWindow(q.dateTo) : undefined

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

    // Le dataset relie une ville à elle-même quand elle a plusieurs gares : Lyon Part-Dieu
    // → Lyon Perrache portent tous deux le libellé « LYON (intramuros) ». C'est un vrai
    // train, mais pas une destination : personne ne cherche où aller depuis Lyon pour
    // s'entendre répondre Lyon.
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
      // La date bornée, pas celle demandée : le front doit refléter la plage réellement explorée.
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
