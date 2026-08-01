import { cleanString } from '~~/shared/normalize'

/**
 * Tourist notoriety score per station = number of Wikipedia language editions for the city
 * (a free proxy). Built by scripts/build-popularity.mjs.
 */
let index: Record<string, number> | null = null

async function getIndex(): Promise<Record<string, number>> {
  if (!index) {
    try {
      index = (await useStorage('assets:server').getItem<Record<string, number>>('popularity.json')) || {}
    } catch {
      index = {}
    }
  }
  return index
}

/** Notoriety score of a station (undefined when unknown). */
export async function lookupPopularity(label: string): Promise<number | undefined> {
  const idx = await getIndex()
  return idx[cleanString(label)]
}
