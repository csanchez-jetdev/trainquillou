import booking from './booking.json'

/**
 * Table des gares, construite et vérifiée par scripts/build-booking.py.
 * Clé : libellé normalisé. Valeur : libellé d'origine + slug de ville.
 *
 * Importée directement plutôt que lue via useStorage : elle sert aussi aux pages
 * pré-rendues, qui ne doivent dépendre d'aucun appel réseau au moment du build.
 */
export interface StationEntry {
  label: string
  slug: string
}

const entries = booking as Record<string, StationEntry>

/** Slug de réservation d'une gare (undefined si aucun n'a pu être vérifié). */
export function bookingSlug(normalizedLabel: string): string | undefined {
  return entries[normalizedLabel]?.slug
}

/**
 * Gares adressables par une page `/depuis/[slug]`, triées par slug.
 *
 * Plusieurs gares d'une même ville partagent un slug (Montpellier Saint-Roch et
 * Montpellier Sud de France) : on retient la première par ordre alphabétique de
 * libellé, pour que l'URL désigne toujours la même page.
 */
export const STATION_PAGES: StationEntry[] = (() => {
  const bySlug = new Map<string, string>()
  for (const { label, slug } of Object.values(entries)) {
    const kept = bySlug.get(slug)
    if (!kept || label.localeCompare(kept) < 0) bySlug.set(slug, label)
  }
  return [...bySlug.entries()]
    .map(([slug, label]) => ({ slug, label }))
    .sort((a, b) => a.slug.localeCompare(b.slug))
})()

export function stationBySlug(slug: string): StationEntry | undefined {
  return STATION_PAGES.find((s) => s.slug === slug)
}

/** Sigles que la mise en forme ne doit pas capitaliser comme des mots. */
const ACRONYMS = new Set(['TGV', 'SNCF', 'CDG', 'HBF', 'HB', 'SBB', 'RER', 'TER', 'BV'])

/**
 * Nom lisible d'une gare : « MARSEILLE ST CHARLES » devient « Marseille St Charles »,
 * « AVIGNON TGV » reste « Avignon TGV ».
 */
export function prettyLabel(label: string): string {
  return label
    .replace(/\(intramuros\)/gi, '')
    .trim()
    .split(/(\s+)/)
    .map((chunk) => {
      if (/^\s+$/.test(chunk)) return chunk
      if (ACRONYMS.has(chunk.toUpperCase().replace(/[.]/g, ''))) return chunk.toUpperCase()
      return chunk
        .toLocaleLowerCase('fr')
        .replace(/(^|['-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toLocaleUpperCase('fr'))
    })
    .join('')
}
