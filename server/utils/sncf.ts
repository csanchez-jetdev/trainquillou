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

export function groupReservableTrains(records: RawRecord[]): Destination[] {
  const byDest = new Map<string, Train[]>()
  for (const r of records) {
    if (r.od_happy_card !== 'OUI') continue
    const list = byDest.get(r.destination) || []
    list.push({ departure: r.heure_depart, arrival: r.heure_arrivee, trainNumber: r.train_no || null })
    byDest.set(r.destination, list)
  }
  return [...byDest.entries()]
    .map(([label, trains]) => ({
      label,
      coords: null as Destination['coords'],
      trains: trains.sort((a, b) => a.departure.localeCompare(b.departure)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
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

export async function fetchReturnDates(origin: string, destination: string, from: string): Promise<string[]> {
  const records = await fetchRecords({
    refine: ['od_happy_card:OUI'],
    where: `origine like "${origin.replace(/"/g, '')}" and destination like "${destination.replace(/"/g, '')}" and date >= date'${from}'`,
  })
  return [...new Set(records.map((r) => r.date))].sort()
}
