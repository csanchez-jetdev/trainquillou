/** Lowercase, no accents, no punctuation, whitespace collapsed. */
export function cleanString(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Do two labels name the same station (tolerant of accents, case and inclusion)? */
export function sameStation(a: string, b: string): boolean {
  const x = cleanString(a)
  const y = cleanString(b)
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}
