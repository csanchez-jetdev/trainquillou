/**
 * MAX JEUNE (formerly TGVmax) booking window.
 *
 * Free seats only open 30 days before departure. This is not a limit we impose: the SNCF
 * dataset is literally named "Disponibilité **à 30 jours** de places MAX JEUNE et MAX SENIOR
 * ouvertes à la réservation" and holds nothing beyond that. Asking for day 31 returns zero
 * results, which reads as an app failure rather than a product rule.
 */
export const BOOKING_WINDOW_DAYS = 30

// `en-CA` formats as `YYYY-MM-DD`.
const PARIS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
})

/** Today in Paris — the window is SNCF's, and the server renders it from a container in UTC. */
export function todayISO(now: Date = new Date()): string {
  return PARIS.format(now)
}

/** Last bookable day, inclusive. */
export function lastBookableISO(now: Date = new Date()): string {
  const [year, month, day] = todayISO(now).split('-')
  // Calendar arithmetic, not milliseconds: a daylight saving change would shift it by a day.
  const last = Date.UTC(Number(year), Number(month) - 1, Number(day) + BOOKING_WINDOW_DAYS)
  return new Date(last).toISOString().slice(0, 10)
}

/** `true` when the `YYYY-MM-DD` date falls inside the bookable window. */
export function isBookable(date: string, now: Date = new Date()): boolean {
  return date >= todayISO(now) && date <= lastBookableISO(now)
}

/** Pulls a date back into the window, to clamp a range rather than reject it. */
export function clampToWindow(date: string, now: Date = new Date()): string {
  const first = todayISO(now)
  const last = lastBookableISO(now)
  if (date < first) return first
  if (date > last) return last
  return date
}
