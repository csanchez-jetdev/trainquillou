/**
 * Booking URLs for both resellers, built from the city slugs verified by
 * scripts/build-booking.py.
 *
 * Neither SNCF Connect nor Trainline exposes a deep link to a pre-filled search: their forms
 * are JavaScript-driven with no `action`, and the "Réserver" buttons on their timetable pages
 * carry no `href`. Their only addressable public surface is the timetable page for a pair of
 * cities — without the date, which the visitor has to pick on arrival.
 */

/** SNCF Connect generates these pages for arbitrary pairs. */
export function sncfConnectUrl(fromSlug: string, toSlug: string): string {
  return `https://www.sncf-connect.com/train/horaires/${fromSlug}/${toSlug}`
}

/**
 * Trainline only publishes these pages for busy routes: a rare one can land on their 404.
 * Hence a secondary link.
 */
export function trainlineUrl(fromSlug: string, toSlug: string): string {
  return `https://www.thetrainline.com/fr/horaires-train/${fromSlug}-a-${toSlug}`
}
