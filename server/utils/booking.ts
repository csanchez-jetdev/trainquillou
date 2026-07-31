import { cleanString } from './normalize'

/**
 * Slug de ville utilisé par les sites de réservation dans leurs URL de pages horaires.
 * Construit et vérifié par scripts/build-booking.py.
 *
 * Les libellés de gares du dataset TGVmax ne fonctionnent pas dans ces URL
 * (`marseille-st-charles` renvoie 404, `marseille` fonctionne), d'où cette table.
 */
let index: Record<string, string> | null = null

async function getIndex(): Promise<Record<string, string>> {
  if (!index) {
    try {
      index = (await useStorage('assets:server').getItem<Record<string, string>>('booking.json')) || {}
    } catch {
      index = {}
    }
  }
  return index
}

/** Slug de réservation d'une gare (undefined si aucun n'a pu être vérifié). */
export async function lookupBookingSlug(label: string): Promise<string | undefined> {
  const idx = await getIndex()
  return idx[cleanString(label)]
}
