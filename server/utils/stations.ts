import { cleanString } from './normalize'

export type Coords = [number, number] // [lat, lon]
export type CoordsIndex = Map<string, Coords>

export const FOREIGN_STATIONS: Record<string, Coords> = {
  'freiburg': [47.9977919, 7.8426094],
  'freiburg breisgau': [47.9977919, 7.8426094],
  'freiburg breisgau hbf': [47.9977919, 7.8426094],
  'freiburg hbf': [47.9977919, 7.8426094],
  'geneve': [46.210017, 6.142738],
  'geneva': [46.210017, 6.142738],
  'zurich': [47.378177, 8.540192],
  'zurich hb': [47.378177, 8.540192],
  'zurich hbf': [47.378177, 8.540192],
  'bruxelles midi': [50.835694, 4.336934],
  'bruxelles central': [50.846733, 4.35706],
  'bruxelles': [50.846733, 4.35706],
  'brussels': [50.846733, 4.35706],
  'milano centrale': [45.485051, 9.204158],
  'milan centrale': [45.485051, 9.204158],
  'luxembourg': [49.5996198, 6.1348882],
  'barcelona sants': [41.379128, 2.140478],
  'basel sbb': [47.54747, 7.58913],
  'frankfurt main hbf': [50.107145, 8.663789],
  'frankfurt hbf': [50.107145, 8.663789],
  'lausanne': [46.516003, 6.629634],
  'offenburg': [48.47302, 7.9455],
  'bern': [46.94809, 7.439116],
  'stuttgart hbf': [48.783615, 9.182902],
  'torino porta susa': [45.07343, 7.659258],
  'vienna hbf': [48.18575, 16.376973],
  'sion': [46.223098, 7.357765],
  'vallorbe': [46.712326, 6.377928],
}

export function buildCoordsIndex(records: Array<{ libelle?: string; commune?: string; x_wgs84?: number; y_wgs84?: number }>): CoordsIndex {
  const index: CoordsIndex = new Map()
  for (const g of records) {
    if (typeof g.x_wgs84 !== 'number' || typeof g.y_wgs84 !== 'number') continue
    const coords: Coords = [g.y_wgs84, g.x_wgs84]
    if (g.libelle) index.set(cleanString(g.libelle), coords)
    if (g.commune) {
      const k = cleanString(g.commune)
      if (!index.has(k)) index.set(k, coords)
    }
  }
  return index
}

export function lookupCoords(index: CoordsIndex, label: string): Coords | null {
  const key = cleanString(label)
  if (!key) return null
  if (FOREIGN_STATIONS[key]) return FOREIGN_STATIONS[key]
  if (index.has(key)) return index.get(key)!
  const first = key.split(' ')[0]
  for (const [k, v] of index) {
    if (k.startsWith(first) || k.includes(key) || key.includes(k)) return v
  }
  return null
}
