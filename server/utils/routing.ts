import { cleanString, sameStation } from './normalize'
import { fetchOutbound, fetchInbound, type RawRecord } from './sncf'
import type { Itinerary, RouteLeg } from '~~/shared/types'

/** Marge minimale de correspondance (minutes) — les réservations TGVmax sont indépendantes. */
const MIN_TRANSFER = 10
/** Budget d'appels API pour l'expansion 2 correspondances (réseau en étoile : peu utile au-delà). */
const MAX_FETCHES = 40
/** Nombre d'itinéraires distincts renvoyés. */
const MAX_ITINERARIES = 8

interface InternalLeg {
  from: string
  to: string
  departure: string
  arrival: string
  trainNumber: string | null
  depMin: number
  arrMin: number
}

function toMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

function toLeg(r: RawRecord): InternalLeg {
  const depMin = toMin(r.heure_depart)
  let arrMin = toMin(r.heure_arrivee)
  if (arrMin < depMin) arrMin += 1440 // arrivée après minuit
  return {
    from: r.origine,
    to: r.destination,
    departure: r.heure_depart,
    arrival: r.heure_arrivee,
    trainNumber: r.train_no || null,
    depMin,
    arrMin,
  }
}

/** Correspondance valable : départ suffisamment après l'arrivée, le même jour. */
function connects(prev: InternalLeg, next: InternalLeg): boolean {
  return prev.arrMin < 1440 && next.depMin >= prev.arrMin + MIN_TRANSFER
}

export interface RouteSearch {
  itineraries: Itinerary[]
  truncated: boolean // true si le budget d'appels a borné l'exploration 2 correspondances
}

/**
 * Cherche des itinéraires A → B le jour `date`, avec au plus `maxStops` (0, 1 ou 2)
 * gares intermédiaires, en respectant l'ordre temporel des correspondances.
 *
 * Stratégie économe : direct et 1 correspondance via le croisement
 * outbound(A) ∩ inbound(B) (2 appels) ; 2 correspondances par expansion bornée.
 * Renvoie un itinéraire par « forme de trajet » (jeu de gares intermédiaires),
 * le plus rapide pour cette forme.
 */
export async function findItineraries(
  from: string,
  to: string,
  date: string,
  maxStops: number,
): Promise<RouteSearch> {
  const stops = Math.max(0, Math.min(2, maxStops))
  const cache = new Map<string, InternalLeg[]>()
  let fetches = 0
  let truncated = false
  const paths: InternalLeg[][] = []

  async function legsFrom(station: string): Promise<InternalLeg[]> {
    const key = cleanString(station)
    const hit = cache.get(key)
    if (hit) return hit
    const legs = (await fetchOutbound(station, date)).map(toLeg)
    cache.set(key, legs)
    fetches++
    return legs
  }

  // Hop 0 : trajet direct
  const fromLegs = await legsFrom(from)
  for (const l of fromLegs) if (sameStation(l.to, to)) paths.push([l])

  if (stops >= 1) {
    const inbound = (await fetchInbound(to, date)).map(toLeg)
    fetches++

    // 1 correspondance : A → X → B
    for (const l1 of fromLegs) {
      if (sameStation(l1.to, to) || sameStation(l1.to, from)) continue
      for (const l2 of inbound) {
        if (!sameStation(l2.from, l1.to) || sameStation(l2.from, from)) continue
        if (connects(l1, l2)) paths.push([l1, l2])
      }
    }

    if (stops >= 2) {
      // Index des legs Y → B par gare Y, pour boucler la dernière correspondance
      const inboundByY = new Map<string, InternalLeg[]>()
      for (const l of inbound) {
        const k = cleanString(l.from)
        const arr = inboundByY.get(k) || []
        arr.push(l)
        inboundByY.set(k, arr)
      }

      // 2 correspondances : A → X → Y → B (exploration bornée, plus tôt arrivé d'abord)
      const candidatesX = [...fromLegs].sort((a, b) => a.arrMin - b.arrMin)
      for (const l1 of candidatesX) {
        if (sameStation(l1.to, to) || sameStation(l1.to, from)) continue
        if (fetches >= MAX_FETCHES) {
          truncated = true
          break
        }
        const xLegs = await legsFrom(l1.to)
        for (const l2 of xLegs) {
          if (!connects(l1, l2)) continue
          const Y = l2.to
          if (sameStation(Y, from) || sameStation(Y, l1.to) || sameStation(Y, to)) continue
          const yb = inboundByY.get(cleanString(Y))
          if (!yb) continue
          for (const l3 of yb) {
            if (connects(l2, l3)) paths.push([l1, l2, l3])
          }
        }
      }
    }
  }

  // Une forme de trajet = la séquence des gares intermédiaires. On garde le plus rapide.
  const bestByShape = new Map<string, Itinerary>()
  for (const legs of paths) {
    const intermediate = legs.slice(0, -1).map((l) => l.to)
    const shape = intermediate.map(cleanString).join(' > ')
    const departure = legs[0]!.departure
    const arrival = legs[legs.length - 1]!.arrival
    const durationMin = legs[legs.length - 1]!.arrMin - legs[0]!.depMin
    const itinerary: Itinerary = {
      legs: legs.map<RouteLeg>((l) => ({
        from: l.from,
        to: l.to,
        fromCoords: null,
        toCoords: null,
        departure: l.departure,
        arrival: l.arrival,
        trainNumber: l.trainNumber,
      })),
      stops: intermediate.length,
      departure,
      arrival,
      durationMin,
    }
    const prev = bestByShape.get(shape)
    if (!prev || durationMin < prev.durationMin) bestByShape.set(shape, itinerary)
  }

  const itineraries = [...bestByShape.values()]
    .sort((a, b) => a.durationMin - b.durationMin || a.stops - b.stops)
    .slice(0, MAX_ITINERARIES)

  return { itineraries, truncated }
}
