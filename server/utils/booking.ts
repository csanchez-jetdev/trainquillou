import { cleanString } from './normalize'
import { bookingSlug } from '~~/shared/stations'

/**
 * Slug de ville utilisé par les sites de réservation dans leurs URL de pages horaires.
 * Construit et vérifié par scripts/build-booking.py.
 *
 * Les libellés de gares du dataset TGVmax ne fonctionnent pas dans ces URL
 * (`marseille-st-charles` renvoie 404, `marseille` fonctionne), d'où cette table.
 */
export function lookupBookingSlug(label: string): string | undefined {
  return bookingSlug(cleanString(label))
}
