export function cleanString(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function isKnownStation(label: string, stations: string[]): boolean {
  // An empty list is /api/stations not having answered: the form must not block on it.
  if (!label.trim() || !stations.length) return true
  const q = cleanString(label)
  // Strict equality, never containment: "marie" must not pass for MARSEILLE.
  return stations.some((s) => cleanString(s) === q)
}

/** Tolerant of inclusion, unlike `isKnownStation`: "Lyon" matches "LYON (intramuros)". */
export function sameStation(a: string, b: string): boolean {
  const x = cleanString(a)
  const y = cleanString(b)
  if (!x || !y) return false
  return x === y || x.includes(y) || y.includes(x)
}
