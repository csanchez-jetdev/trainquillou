import { cleanString } from './normalize'

/**
 * Score de notoriété touristique par gare = nb d'éditions linguistiques Wikipédia
 * de la ville (proxy gratuit). Construit par scripts/build-popularity.mjs.
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

/** Score de notoriété d'une gare (undefined si inconnue). */
export async function lookupPopularity(label: string): Promise<number | undefined> {
  const idx = await getIndex()
  return idx[cleanString(label)]
}
