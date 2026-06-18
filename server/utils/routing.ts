import { cleanString, sameStation } from './normalize'
import { fetchOutbound, fetchInbound, type RawRecord } from './sncf'
import type { Itinerary, RouteLeg } from '~~/shared/types'

/** Marge minimale de correspondance (minutes) — les réservations TGVmax sont indépendantes. */
const MIN_TRANSFER = 10
/** Nombre maximal de gares intermédiaires supporté. */
const MAX_STOPS = 3
/** Budget d'appels API pour l'expansion intermédiaire (le 1er/dernier hop n'y comptent pas). */
const FETCH_BUDGET = 50
/** Taille max du front d'exploration conservé à chaque niveau (les arrivées les plus tôt). */
const FRONTIER_CAP = 12
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

interface PartialPath {
  node: string // gare courante (fin du dernier leg)
  arrMin: number // heure d'arrivée à `node`
  legs: InternalLeg[]
  visited: Set<string>
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
function connects(prevArrMin: number, next: InternalLeg): boolean {
  return prevArrMin < 1440 && next.depMin >= prevArrMin + MIN_TRANSFER
}

export interface RouteSearch {
  itineraries: Itinerary[]
  truncated: boolean // true si le budget d'appels a borné l'exploration
}

/**
 * Cherche des itinéraires A → B le jour `date`, avec au plus `maxStops` (0..3) gares
 * intermédiaires, en respectant l'ordre temporel des correspondances.
 *
 * BFS « time-dependent » : on part de outbound(A), on étend de proche en proche les
 * gares intermédiaires (appels bornés par un budget + élagage par arrivée au plus tôt),
 * et le dernier hop vers B est résolu via l'index inbound(B) — donc 0/1 correspondance
 * ne coûtent que 2 appels. Renvoie un itinéraire par « forme de trajet » (jeu de gares
 * intermédiaires), le plus rapide pour cette forme.
 */
export async function findItineraries(
  from: string,
  to: string,
  date: string,
  maxStops: number,
): Promise<RouteSearch> {
  const stops = Math.max(0, Math.min(MAX_STOPS, maxStops))
  const cache = new Map<string, InternalLeg[]>()
  let fetches = 0
  let truncated = false
  const completed: InternalLeg[][] = []

  async function legsFrom(station: string): Promise<InternalLeg[]> {
    const key = cleanString(station)
    const hit = cache.get(key)
    if (hit) return hit
    const legs = (await fetchOutbound(station, date)).map(toLeg)
    cache.set(key, legs)
    fetches++
    return legs
  }

  const fromLegs = await legsFrom(from)

  // Trajets directs
  for (const l of fromLegs) if (sameStation(l.to, to)) completed.push([l])

  if (stops >= 1) {
    // Index des legs Y → B par gare Y (résout le dernier hop sans appel supplémentaire)
    const inbound = (await fetchInbound(to, date)).map(toLeg)
    const inboundByY = new Map<string, InternalLeg[]>()
    for (const l of inbound) {
      const k = cleanString(l.from)
      const arr = inboundByY.get(k) || []
      arr.push(l)
      inboundByY.set(k, arr)
    }

    const closeToB = (legs: InternalLeg[], node: string, arrMin: number) => {
      for (const lb of inboundByY.get(cleanString(node)) || []) {
        if (connects(arrMin, lb)) completed.push([...legs, lb])
      }
    }

    // Front initial : un leg A → X1 (X1 ni A ni B)
    let frontier: PartialPath[] = fromLegs
      .filter((l) => !sameStation(l.to, to) && !sameStation(l.to, from))
      .map((l) => ({ node: l.to, arrMin: l.arrMin, legs: [l], visited: new Set([cleanString(from), cleanString(l.to)]) }))

    // 1 correspondance : ferme chaque X1 vers B
    for (const s of frontier) closeToB(s.legs, s.node, s.arrMin)

    // Correspondances supplémentaires : on ajoute une gare intermédiaire à chaque tour
    for (let extra = 1; extra < stops; extra++) {
      const next: PartialPath[] = []
      for (const s of frontier) {
        if (fetches >= FETCH_BUDGET) {
          truncated = true
          break
        }
        const legs = await legsFrom(s.node)
        for (const l of legs) {
          if (!connects(s.arrMin, l)) continue
          const nk = cleanString(l.to)
          if (s.visited.has(nk)) continue
          const path = [...s.legs, l]
          if (sameStation(l.to, to)) {
            completed.push(path)
            continue
          }
          const state: PartialPath = { node: l.to, arrMin: l.arrMin, legs: path, visited: new Set([...s.visited, nk]) }
          closeToB(path, l.to, l.arrMin) // ferme à ce niveau de correspondance
          next.push(state)
        }
      }
      // Élagage par dominance : meilleure (plus tôt) arrivée par gare, puis cap
      const bestByNode = new Map<string, PartialPath>()
      for (const s of next) {
        const ex = bestByNode.get(cleanString(s.node))
        if (!ex || s.arrMin < ex.arrMin) bestByNode.set(cleanString(s.node), s)
      }
      frontier = [...bestByNode.values()].sort((a, b) => a.arrMin - b.arrMin).slice(0, FRONTIER_CAP)
    }
  }

  // Une forme de trajet = la séquence des gares intermédiaires. On garde le plus rapide.
  const bestByShape = new Map<string, Itinerary>()
  for (const legs of completed) {
    const intermediate = legs.slice(0, -1).map((l) => l.to)
    const shape = intermediate.map(cleanString).join(' > ')
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
      departure: legs[0]!.departure,
      arrival: legs[legs.length - 1]!.arrival,
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

/** Ajoute `n` jours à une date YYYY-MM-DD (UTC, sans dépendance). */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + n))
  return dt.toISOString().slice(0, 10)
}

/**
 * Parmi les `n` jours suivant `baseDate`, lesquels offrent un trajet A → B faisable
 * en ≤ 1 correspondance ? Sonde légère (2 appels/jour, en parallèle) pour suggérer
 * d'autres dates quand la date demandée ne donne rien — n'explore pas les trajets à
 * 2+ correspondances (coût maîtrisé).
 */
export async function feasibleNextDays(from: string, to: string, baseDate: string, n = 3): Promise<string[]> {
  const days = Array.from({ length: n }, (_, i) => addDays(baseDate, i + 1))
  const checks = await Promise.all(
    days.map(async (day) => {
      const [out, inb] = await Promise.all([fetchOutbound(from, day), fetchInbound(to, day)])
      const outLegs = out.map(toLeg)
      // Direct ?
      if (outLegs.some((l) => sameStation(l.to, to))) return day
      // 1 correspondance ?
      const inByY = new Map<string, InternalLeg[]>()
      for (const r of inb.map(toLeg)) {
        const k = cleanString(r.from)
        const arr = inByY.get(k) || []
        arr.push(r)
        inByY.set(k, arr)
      }
      for (const l1 of outLegs) {
        if (sameStation(l1.to, to) || sameStation(l1.to, from)) continue
        const conns = inByY.get(cleanString(l1.to))
        if (conns && conns.some((l2) => connects(l1.arrMin, l2))) return day
      }
      return null
    }),
  )
  return checks.filter((d): d is string => d != null)
}
