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

/** Groupe les trains réservables par la gare opposée (`destination` ou `origine`). */
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

/** Destinations réservables depuis une origine (groupées par gare d'arrivée). */
export function groupReservableTrains(records: RawRecord[]): Destination[] {
  return groupBy(records, 'destination')
}

/** Origines possibles vers une gare d'arrivée (recherche inverse, groupées par gare de départ). */
export function groupReservableByOrigin(records: RawRecord[]): Destination[] {
  return groupBy(records, 'origine')
}

/**
 * Destinations réservables depuis une origine sur une plage de dates.
 * Chaque destination porte la liste des jours où elle est joignable.
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
    // Les plus « robustes » (joignables le plus de jours) d'abord.
    .sort((a, b) => b.availableDates.length - a.availableDates.length || a.label.localeCompare(b.label))
}

export async function fetchStationLabels(): Promise<string[]> {
  const labels = new Set<string>()
  for (const facet of ['origine', 'destination']) {
    const res = await $fetch<{ facets: Array<{ name: string; facets: Array<{ name: string }> }> }>(
      `${BASE}/facets`,
      { query: { facet } },
    )
    const group = res.facets?.find((f) => f.name === facet)
    group?.facets?.forEach((x) => labels.add(x.name))
  }
  return [...labels].sort((a, b) => a.localeCompare(b))
}

export async function fetchOutbound(origin: string, date: string): Promise<RawRecord[]> {
  return fetchRecords({
    refine: [`date:${date}`, 'od_happy_card:OUI'],
    where: `origine like "${origin.replace(/"/g, '')}"`,
  })
}

/** Trains réservables ARRIVANT dans une gare un jour donné (recherche inverse). */
export async function fetchInbound(destination: string, date: string): Promise<RawRecord[]> {
  return fetchRecords({
    refine: [`date:${date}`, 'od_happy_card:OUI'],
    where: `destination like "${destination.replace(/"/g, '')}"`,
  })
}

/** Trains réservables depuis une origine sur une plage de dates [from, to] incluse. */
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
