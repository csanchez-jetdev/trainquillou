/**
 * Date formatting for the pages that publish dates in their HTML.
 *
 * Built from the parts rather than `new Date(iso)`, which reads the string as UTC and shifts
 * the day back for anyone west of Greenwich.
 */
export function humanDay(iso: string, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('fr-FR', {
    ...(opts.weekday ? { weekday: 'long' as const } : {}),
    day: 'numeric',
    month: 'long',
    ...(opts.year ? { year: 'numeric' as const } : {}),
  })
}

/** "sam." — the weekday alone, for a strip of days where the month is already stated. */
export function shortWeekday(iso: string): string {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('fr-FR', {
    weekday: 'short',
  })
}

/** The day number, for the same strip. */
export function dayNumber(iso: string): string {
  return String(Number(iso.split('-')[2]))
}
