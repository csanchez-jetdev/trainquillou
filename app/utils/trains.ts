import type { Train } from '~~/shared/types'

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/** An arrival time lower than the departure time means a trip crossing midnight. */
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

export function fastestTrip(trains: Train[]): Train | null {
  if (!trains.length) return null
  return trains.reduce((best, t) => (tripDurationMin(t) < tripDurationMin(best) ? t : best))
}

export const DURATION_BANDS = [
  // `short` without a space after ≤: the six filter chips must fit on one line at 360px.
  { max: 90, token: 't1', short: '≤1h30', label: 'moins de 1h30' },
  { max: 180, token: 't2', short: '≤3h', label: '1h30 à 3h' },
  { max: 270, token: 't3', short: '≤4h30', label: '3h à 4h30' },
  { max: Infinity, token: 't4', short: '4h30+', label: 'plus de 4h30' },
] as const

export type DurationBand = (typeof DURATION_BANDS)[number]

export function durationBand(minutes: number | null | undefined): DurationBand | null {
  if (minutes == null) return null
  return DURATION_BANDS.find((b) => minutes <= b.max) ?? null
}

/** Three colours are enough: the API allows two connections at most. */
export const LEG_COLORS = ['#ff6b5e', '#14b8b0', '#6d3f9e'] as const

export function legColor(index: number): string {
  return LEG_COLORS[index % LEG_COLORS.length] ?? LEG_COLORS[0]
}

export function departureWindow(trains: Train[]): { first: string; last: string } | null {
  if (!trains.length) return null
  const sorted = [...trains].sort((a, b) => a.departure.localeCompare(b.departure))
  return { first: sorted[0]!.departure, last: sorted[sorted.length - 1]!.departure }
}
