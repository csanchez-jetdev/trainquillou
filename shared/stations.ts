import booking from './booking.json'
import stationPages from './station-pages.json'
import routePages from './route-pages.json'

/**
 * Station table, built and verified by scripts/build-booking.py.
 * Key: normalised label. Value: original label + city slug.
 *
 * Imported directly rather than read through useStorage: it also serves the prerendered
 * pages, which must not depend on any network call at build time.
 */
export interface StationEntry {
  label: string
  slug: string
}

const entries = booking as Record<string, StationEntry>

/** Booking slug of a station (undefined when none could be verified). */
export function bookingSlug(normalizedLabel: string): string | undefined {
  return entries[normalizedLabel]?.slug
}

/**
 * Stations addressable through a `/depuis/[slug]` page, sorted by slug.
 *
 * Selected and ranked by scripts/build-station-pages.py: stations that combine real search
 * demand with a TGVmax offer wide enough for the page to have something to show. Every
 * station in the dataset stays searchable in the app; only the page list is narrowed.
 *
 * A station missing from here therefore 404s on `/depuis/<slug>`, which is the intent:
 * three hundred pages off the same template are worth less than fifty useful ones, and
 * quality is judged at site scale.
 */
export const STATION_PAGES: StationEntry[] = stationPages

export function stationBySlug(slug: string): StationEntry | undefined {
  return STATION_PAGES.find((s) => s.slug === slug)
}

/** Les départs les plus cherchés, dans l'ordre où l'audience les classe. */
export const POPULAR_STATIONS = [
  { slug: 'paris', name: 'Paris' },
  { slug: 'lyon', name: 'Lyon' },
  { slug: 'marseille-st-charles', name: 'Marseille' },
  { slug: 'bordeaux-st-jean', name: 'Bordeaux' },
  { slug: 'lille', name: 'Lille' },
  { slug: 'nantes', name: 'Nantes' },
  { slug: 'strasbourg', name: 'Strasbourg' },
  { slug: 'toulouse-matabiau', name: 'Toulouse' },
  { slug: 'montpellier', name: 'Montpellier' },
  { slug: 'nice-ville', name: 'Nice' },
  { slug: 'rennes', name: 'Rennes' },
  { slug: 'dijon-ville', name: 'Dijon' },
] as const

/** An origin-destination pair addressable through a `/depuis/[slug]/vers/[to]` page. */
export interface RouteEntry {
  from: string
  to: string
}

/**
 * Pairs addressable through a `/depuis/[slug]/vers/[to]` page, sorted.
 *
 * Selected by scripts/build-route-pages.py, and deliberately far short of every pair the
 * dataset allows: crossing the fifty station pages would publish 2 450 URLs off one
 * template. The list holds the stations whose demand the audience measurement establishes,
 * paired where the TGVmax offer is wide enough for the page to say something.
 */
export const ROUTE_PAGES: RouteEntry[] = routePages

export function routeBySlugs(from: string, to: string): RouteEntry | undefined {
  return ROUTE_PAGES.find((r) => r.from === from && r.to === to)
}

/** The pages leaving from a given station, for internal linking. */
export function routesFrom(slug: string): RouteEntry[] {
  return ROUTE_PAGES.filter((r) => r.from === slug)
}

/** Acronyms the formatter must not capitalise like ordinary words. */
const ACRONYMS = new Set(['TGV', 'SNCF', 'CDG', 'HBF', 'HB', 'SBB', 'RER', 'TER', 'BV'])

/**
 * City name for a station page, where the SNCF label is not one: it carries the station's own
 * qualifier ("NIMES CENTRE") or drops the French diacritics ("BEZIERS"). Both are what people
 * type, so both belong in headings and titles. Anything absent falls back to the label.
 *
 * A qualifier that distinguishes two real stops stays: Avignon TGV is not Avignon Centre, and
 * Saint-Pierre-des-Corps is not Tours.
 */
const CITY_NAMES: Record<string, string> = {
  'aix-en-provence-tgv': 'Aix-en-Provence TGV',
  'angers': 'Angers',
  'angouleme': 'Angoulême',
  'beziers': 'Béziers',
  'bordeaux-st-jean': 'Bordeaux',
  'champagne-ardenne-tgv': 'Champagne-Ardenne TGV',
  'dijon-ville': 'Dijon',
  'marseille-st-charles': 'Marseille',
  'metz': 'Metz',
  'montauban-ville-bourbon': 'Montauban',
  'montpellier': 'Montpellier',
  'mulhouse': 'Mulhouse',
  'nice-ville': 'Nice',
  'nimes': 'Nîmes',
  'rouen-rive-droite': 'Rouen',
  'sete': 'Sète',
  'st-brieuc': 'Saint-Brieuc',
  'st-nazaire': 'Saint-Nazaire',
  'st-pierre-des-corps': 'Saint-Pierre-des-Corps',
  'toulouse-matabiau': 'Toulouse',
  'valence-tgv': 'Valence TGV',
}

/** Short name of the city a station page covers. */
export function cityName(slug: string): string {
  return CITY_NAMES[slug] ?? prettyLabel(stationBySlug(slug)?.label ?? slug)
}

/**
 * Readable station name: "MARSEILLE ST CHARLES" becomes "Marseille St Charles",
 * "AVIGNON TGV" stays "Avignon TGV".
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
