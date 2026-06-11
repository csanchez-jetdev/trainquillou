/** Minuscule, sans accents, sans ponctuation, espaces compactés. */
export function cleanString(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Deux libellés désignent-ils la même gare (tolérant accents/casse/inclusion) ? */
export function sameStation(a: string, b: string): boolean {
  const x = cleanString(a)
  const y = cleanString(b)
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}
