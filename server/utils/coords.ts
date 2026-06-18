import { buildCoordsIndex, type CoordsIndex } from './stations'

let coordsIndex: CoordsIndex | null = null

/** Index des coordonnées de gares (construit une fois depuis gares.json, mémoïsé). */
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
