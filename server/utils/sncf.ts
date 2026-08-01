import { cleanString } from './normalize'
import type { Destination, Train } from '~~/shared/types'

const BASE = 'https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax'
const PAGE = 100

export interface RawRecord {
  date: string
  train_no: string
  origine: string
  destination: string
  heure_depart: string
  heure_arrivee: string
  od_happy_card: 'OUI' | 'NON'
}

interface RecordsResponse {
  total_count: number
  results: RawRecord[]
}

async function fetchRecords(params: Record<string, string | string[]>): Promise<RawRecord[]> {
  const all: RawRecord[] = []
  let offset = 0
  while (true) {
    const url = new URL(`${BASE}/records`)
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x))
      else url.searchParams.set(k, v)
    }
    url.searchParams.set('limit', String(PAGE))
    url.searchParams.set('offset', String(offset))
    const res = await $fetch<RecordsResponse>(url.toString())
    all.push(...(res.results || []))
    offset += PAGE
    if (offset >= (res.total_count || 0) || offset >= 10000) break
  }
  return all
}

/** Groups bookable trains by the opposite station (`destination` or `origine`). */
function groupBy(records: RawRecord[], key: 'destination' | 'origine'): Destination[] {
  const byLabel = new Map<string, Train[]>()
  for (const r of records) {
    if (r.od_happy_card !== 'OUI') continue
    const list = byLabel.get(r[key]) || []
    list.push({ departure: r.heure_depart, arrival: r.heure_arrivee, trainNumber: r.train_no || null })
    byLabel.set(r[key], list)
  }
  return [...byLabel.entries()]
    .map(([label, trains]) => ({
      label,
      coords: null as Destination['coords'],
      trains: trains.sort((a, b) => a.departure.localeCompare(b.departure)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Bookable destinations from an origin (grouped by arrival station). */
export function groupReservableTrains(records: RawRecord[]): Destination[] {
  return groupBy(records, 'destination')
}

/** Possible origins for an arrival station (reverse search, grouped by departure station). */
export function groupReservableByOrigin(records: RawRecord[]): Destination[] {
  return groupBy(records, 'origine')
}

/**
 * Bookable destinations from an origin over a date range.
 * Each destination carries the list of days it can be reached on.
 */
export function groupReservableByDate(records: RawRecord[]): Destination[] {
  const datesByDest = new Map<string, Set<string>>()
  for (const r of records) {
    if (r.od_happy_card !== 'OUI') continue
    const set = datesByDest.get(r.destination) || new Set<string>()
    set.add(r.date)
    datesByDest.set(r.destination, set)
  }
  return [...datesByDest.entries()]
    .map(([label, dates]) => ({
      label,
      coords: null as Destination['coords'],
      trains: [] as Train[],
      availableDates: [...dates].sort(),
    }))
    // Most robust first (reachable on the largest number of days).
    .sort((a, b) => b.availableDates.length - a.availableDates.length || a.label.localeCompare(b.label))
}

/** Labels carrying C1 control characters: the dataset holds one, with broken encoding. */
function isMangled(label: string): boolean {
  for (let i = 0; i < label.length; i++) {
    const code = label.charCodeAt(i)
    if (code >= 0x80 && code <= 0x9f) return true
  }
  return false
}

/**
 * Destinations whose outbound AND return legs are both bookable.
 *
 * `outbound` = hub → X trains on the outbound day. `inbound` = Y → hub trains on the return
 * day, so the `origine` field of those records is the candidate destination. Only stations
 * present on both sides are kept. Cost: two upstream calls, same as a plain search.
 */
export function groupRoundTrip(outbound: RawRecord[], inbound: RawRecord[]): Destination[] {
  const outByStation = new Map<string, Train[]>()
  const labelByKey = new Map<string, string>()
  for (const r of outbound) {
    if (r.od_happy_card !== 'OUI') continue
    const key = cleanString(r.destination)
    if (!key) continue
    labelByKey.set(key, r.destination)
    const list = outByStation.get(key) || []
    list.push({ departure: r.heure_depart, arrival: r.heure_arrivee, trainNumber: r.train_no || null })
    outByStation.set(key, list)
  }

  const backByStation = new Map<string, Train[]>()
  for (const r of inbound) {
    if (r.od_happy_card !== 'OUI') continue
    const key = cleanString(r.origine)
    if (!key || !outByStation.has(key)) continue
    const list = backByStation.get(key) || []
    list.push({ departure: r.heure_depart, arrival: r.heure_arrivee, trainNumber: r.train_no || null })
    backByStation.set(key, list)
  }

  const byDeparture = (a: Train, b: Train) => a.departure.localeCompare(b.departure)

  return [...backByStation.entries()]
    .map(([key, returnTrains]) => ({
      label: labelByKey.get(key)!,
      coords: null as Destination['coords'],
      trains: outByStation.get(key)!.sort(byDeparture),
      returnTrains: returnTrains.sort(byDeparture),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Distinct station labels, for autocomplete.
 *
 * Through `group_by` and not the `facets` endpoint: that one silently caps at 100 values
 * and hid 238 of the dataset's 341 stations — Amiens, Annecy, Arcachon and Angoulême were
 * simply not findable in the search.
 */
export async function fetchStationLabels(): Promise<string[]> {
  const labels = new Set<string>()
  for (const field of ['origine', 'destination']) {
    const res = await $fetch<{ results: Array<Record<string, string | null>> }>(
      `${BASE}/records`,
      { query: { select: field, group_by: field, limit: -1 } },
    )
    for (const row of res.results || []) {
      const value = row[field]
      // The broken label duplicates a station already listed: keep it out of the input.
      if (value && !isMangled(value)) labels.add(value)
    }
  }
  return [...labels].sort((a, b) => a.localeCompare(b))
}

export async function fetchOutbound(origin: string, date: string): Promise<RawRecord[]> {
  return fetchRecords({
    refine: [`date:${date}`, 'od_happy_card:OUI'],
    where: `origine like "${origin.replace(/"/g, '')}"`,
  })
}

/** Bookable trains ARRIVING at a station on a given day (reverse search). */
export async function fetchInbound(destination: string, date: string): Promise<RawRecord[]> {
  return fetchRecords({
    refine: [`date:${date}`, 'od_happy_card:OUI'],
    where: `destination like "${destination.replace(/"/g, '')}"`,
  })
}

/** Bookable trains from an origin over the inclusive date range [from, to]. */
export async function fetchOutboundRange(origin: string, from: string, to: string): Promise<RawRecord[]> {
  return fetchRecords({
    refine: ['od_happy_card:OUI'],
    where: `origine like "${origin.replace(/"/g, '')}" and date >= date'${from}' and date <= date'${to}'`,
  })
}

export async function fetchReturnDates(origin: string, destination: string, from: string): Promise<string[]> {
  const records = await fetchRecords({
    refine: ['od_happy_card:OUI'],
    where: `origine like "${origin.replace(/"/g, '')}" and destination like "${destination.replace(/"/g, '')}" and date >= date'${from}'`,
  })
  return [...new Set(records.map((r) => r.date))].sort()
}
