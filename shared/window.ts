/**
 * MAX JEUNE (formerly TGVmax) booking window.
 *
 * Free seats only open 30 days before departure. This is not a limit we impose: the SNCF
 * dataset is literally named "Disponibilité **à 30 jours** de places MAX JEUNE et MAX SENIOR
 * ouvertes à la réservation" and holds nothing beyond that. Asking for day 31 returns zero
 * results, which reads as an app failure rather than a product rule.
 */
export const BOOKING_WINDOW_DAYS = 30

/**
 * Today's date as `YYYY-MM-DD`, in the browser's timezone.
 *
 * `toISOString()` would give the **UTC** date: in France in summer, between midnight and 2am,
 * it still points at yesterday — and the date field would offer a day already gone.
 */
export function todayISO(now: Date = new Date()): string {
  return toISO(now)
}

/** Last bookable day, inclusive. */
export function lastBookableISO(now: Date = new Date()): string {
  const last = new Date(now.getFullYear(), now.getMonth(), now.getDate() + BOOKING_WINDOW_DAYS)
  return toISO(last)
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

function toISO(d: Date): string {
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}
