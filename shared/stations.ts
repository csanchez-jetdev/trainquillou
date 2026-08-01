import booking from './booking.json'
import stationPages from './station-pages.json'

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

/** Acronyms the formatter must not capitalise like ordinary words. */
const ACRONYMS = new Set(['TGV', 'SNCF', 'CDG', 'HBF', 'HB', 'SBB', 'RER', 'TER', 'BV'])

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
