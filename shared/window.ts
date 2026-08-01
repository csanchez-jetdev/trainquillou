/**
 * Fenêtre de réservation MAX JEUNE (ex-TGVmax).
 *
 * Les places à 0 € n'ouvrent que 30 jours avant le départ. Ce n'est pas une limite qu'on
 * s'impose : le jeu de données SNCF s'appelle littéralement « Disponibilité **à 30 jours**
 * de places MAX JEUNE et MAX SENIOR ouvertes à la réservation », et ne contient rien
 * au-delà. Demander le 31ᵉ jour renvoie zéro résultat — ce qui se lit comme une panne de
 * l'application plutôt que comme une règle du produit.
 */
export const BOOKING_WINDOW_DAYS = 30

/**
 * Date du jour au format `YYYY-MM-DD`, dans le fuseau du navigateur.
 *
 * `toISOString()` donnerait la date **UTC** : en France l'été, entre minuit et 2 h du
 * matin, elle désigne encore la veille — et le champ date proposerait un jour déjà passé.
 */
export function todayISO(now: Date = new Date()): string {
  return toISO(now)
}

/** Dernier jour réservable, inclus. */
export function lastBookableISO(now: Date = new Date()): string {
  const last = new Date(now.getFullYear(), now.getMonth(), now.getDate() + BOOKING_WINDOW_DAYS)
  return toISO(last)
}

/** `true` si la date `YYYY-MM-DD` tombe dans la fenêtre réservable. */
export function isBookable(date: string, now: Date = new Date()): boolean {
  return date >= todayISO(now) && date <= lastBookableISO(now)
}

/** Ramène une date dans la fenêtre, pour borner une plage plutôt que la refuser. */
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
