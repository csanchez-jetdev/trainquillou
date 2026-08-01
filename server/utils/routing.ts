import { cleanString, sameStation } from './normalize'
import { fetchOutbound, fetchInbound, type RawRecord } from './sncf'
import type { Itinerary, RouteLeg } from '~~/shared/types'

/** Minimum transfer margin (minutes) — TGVmax bookings are independent of each other. */
const MIN_TRANSFER = 10
/** Highest number of intermediate stations supported. */
const MAX_STOPS = 3
/** API call budget for intermediate expansion (first and last hops do not count). */
const FETCH_BUDGET = 50
/** Max size of the exploration frontier kept at each level (earliest arrivals). */
const FRONTIER_CAP = 12
/** Number of distinct itineraries returned. */
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
  node: string // current station (end of the last leg)
  arrMin: number // arrival time at `node`
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
  if (arrMin < depMin) arrMin += 1440 // arrival past midnight
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

/** Valid connection: departure far enough after arrival, on the same day. */
function connects(prevArrMin: number, next: InternalLeg): boolean {
  return prevArrMin < 1440 && next.depMin >= prevArrMin + MIN_TRANSFER
}

export interface RouteSearch {
  itineraries: Itinerary[]
  truncated: boolean // true when the call budget bounded the exploration
}

/**
 * Finds A → B itineraries on `date`, with at most `maxStops` (0..3) intermediate stations,
 * respecting the chronological order of connections.
 *
 * Time-dependent BFS: start from outbound(A), expand intermediate stations step by step
 * (calls bounded by a budget, pruned by earliest arrival), and resolve the last hop to B
 * through the inbound(B) index — so 0 or 1 connection costs only 2 calls. Returns one
 * itinerary per "trip shape" (set of intermediate stations), the fastest for that shape.
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

  // Direct trips
  for (const l of fromLegs) if (sameStation(l.to, to)) completed.push([l])

  if (stops >= 1) {
    // Index of Y → B legs by station Y (resolves the last hop with no extra call)
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

    // Initial frontier: one A → X1 leg (X1 being neither A nor B)
    let frontier: PartialPath[] = fromLegs
      .filter((l) => !sameStation(l.to, to) && !sameStation(l.to, from))
      .map((l) => ({ node: l.to, arrMin: l.arrMin, legs: [l], visited: new Set([cleanString(from), cleanString(l.to)]) }))

    // 1 connection: close each X1 towards B
    for (const s of frontier) closeToB(s.legs, s.node, s.arrMin)

    // Further connections: one more intermediate station per round
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
          closeToB(path, l.to, l.arrMin) // close at this connection level
          next.push(state)
        }
      }
      // Dominance pruning: best (earliest) arrival per station, then cap
      const bestByNode = new Map<string, PartialPath>()
      for (const s of next) {
        const ex = bestByNode.get(cleanString(s.node))
        if (!ex || s.arrMin < ex.arrMin) bestByNode.set(cleanString(s.node), s)
      }
      frontier = [...bestByNode.values()].sort((a, b) => a.arrMin - b.arrMin).slice(0, FRONTIER_CAP)
    }
  }

  // A trip shape = the sequence of intermediate stations. Keep the fastest one.
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

/** Adds `n` days to a YYYY-MM-DD date (UTC, no dependency). */
function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d! + n))
  return dt.toISOString().slice(0, 10)
}

/**
 * Which of the `n` days after `baseDate` offer an A → B trip in ≤ 1 connection? A light
 * probe (2 calls per day, in parallel) to suggest other dates when the requested one comes
 * up empty. Does not explore trips with 2+ connections, to keep the cost bounded.
 */
export async function feasibleNextDays(from: string, to: string, baseDate: string, n = 3): Promise<string[]> {
  const days = Array.from({ length: n }, (_, i) => addDays(baseDate, i + 1))
  const checks = await Promise.all(
    days.map(async (day) => {
      const [out, inb] = await Promise.all([fetchOutbound(from, day), fetchInbound(to, day)])
      const outLegs = out.map(toLeg)
      // Direct?
      if (outLegs.some((l) => sameStation(l.to, to))) return day
      // 1 connection?
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
