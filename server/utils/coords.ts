import { buildCoordsIndex, type CoordsIndex } from './stations'

let coordsIndex: CoordsIndex | null = null

/** Station coordinates index (built once from gares.json, memoised). */
export async function getCoordsIndex(): Promise<CoordsIndex> {
  if (!coordsIndex) {
    try {
      const records = await useStorage('assets:server').getItem<any[]>('gares.json')
      coordsIndex = buildCoordsIndex(records || [])
    } catch {
      coordsIndex = new Map()
    }
  }
  return coordsIndex
}
