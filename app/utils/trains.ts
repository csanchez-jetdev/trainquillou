import type { Train } from '~~/shared/types'

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Durée d'un trajet en minutes.
 *
 * Un train partant à 23:40 et arrivant à 01:15 a une heure d'arrivée inférieure à son
 * heure de départ : sans le rattrapage, la durée serait négative.
 */
export function tripDurationMin(train: Train): number {
  const departure = toMinutes(train.departure)
  let arrival = toMinutes(train.arrival)
  if (arrival < departure) arrival += 1440
  return arrival - departure
}

/** « 1h56 », « 45 min ». */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/** Trajet le plus rapide d'une liste, pour résumer une destination en un chiffre. */
export function fastestTrip(trains: Train[]): Train | null {
  if (!trains.length) return null
  return trains.reduce((best, t) => (tripDurationMin(t) < tripDurationMin(best) ? t : best))
}

/** Fenêtre couverte par une liste de trains : « 6 départs, de 07:00 à 21:25 ». */
export function departureWindow(trains: Train[]): { first: string; last: string } | null {
  if (!trains.length) return null
  const sorted = [...trains].sort((a, b) => a.departure.localeCompare(b.departure))
  return { first: sorted[0]!.departure, last: sorted[sorted.length - 1]!.departure }
}
