import { cleanString } from './normalize'
import { bookingSlug } from '~~/shared/stations'

/**
 * City slug used by the booking sites in their timetable URLs. Built and verified by
 * scripts/build-booking.py.
 *
 * TGVmax station labels do not work in those URLs (`marseille-st-charles` 404s,
 * `marseille` works), hence this table.
 */
export function lookupBookingSlug(label: string): string | undefined {
  return bookingSlug(cleanString(label))
}
