import booking from './booking.json'
import stationPages from './station-pages.json'

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
 * Sélection construite et classée par scripts/build-station-pages.py : les gares
 * qui réunissent une demande de recherche réelle et une offre TGVmax assez large
 * pour que la page ait quelque chose à montrer. Toutes les gares du jeu de données
 * restent cherchables dans l'application ; seule la liste des pages est réduite.
 *
 * Une gare absente d'ici renvoie donc un 404 sur `/depuis/<slug>`, ce qui est
 * l'intention : trois cents pages bâties sur le même gabarit valent moins que
 * cinquante pages utiles, et la qualité s'apprécie à l'échelle du site.
 */
export const STATION_PAGES: StationEntry[] = stationPages

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
