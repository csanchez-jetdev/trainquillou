import type { Train } from '~~/shared/types'

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Trip duration in minutes.
 *
 * A train leaving at 23:40 and arriving at 01:15 has an arrival time lower than its
 * departure time: without the catch-up, the duration would come out negative.
 */
export function tripDurationMin(train: Train): number {
  const departure = toMinutes(train.departure)
  let arrival = toMinutes(train.arrival)
  if (arrival < departure) arrival += 1440
  return arrival - departure
}

/** "1h56", "45 min". */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

/** Fastest trip in a list, to sum a destination up in a single figure. */
export function fastestTrip(trains: Train[]): Train | null {
  if (!trains.length) return null
  return trains.reduce((best, t) => (tripDurationMin(t) < tripDurationMin(best) ? t : best))
}

/** Window covered by a list of trains: "6 departures, from 07:00 to 21:25". */
export function departureWindow(trains: Train[]): { first: string; last: string } | null {
  if (!trains.length) return null
  const sorted = [...trains].sort((a, b) => a.departure.localeCompare(b.departure))
  return { first: sorted[0]!.departure, last: sorted[sorted.length - 1]!.departure }
}
