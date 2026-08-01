import { cleanString } from '~~/shared/normalize'

export type Coords = [number, number] // [lat, lon]
export type CoordsIndex = Map<string, Coords>

/**
 * Tokens the TGVmax dataset adds and the station reference ignores.
 * "PARIS (intramuros)" names the city, not a specific station.
 */
const NOISE_TOKENS = new Set(['intramuros'])

/** The reference abbreviates what TGVmax spells out: "Angers-St-Laud" / "ANGERS SAINT LAUD". */
const ABBREVIATIONS: Record<string, string> = { saint: 'st', sainte: 'ste' }

/**
 * In the fallback, a short word matches by accident: "ur" (a village in the Pyrenees) is a
 * syllable of "frankfURt", "rai" one of "lorRAIne". Only words of 3 letters or more are
 * compared, and never as substrings.
 */
const MIN_MATCH_LEN = 3

function tokenize(label: string): string[] {
  return cleanString(label)
    .split(' ')
    .filter((t) => t && !NOISE_TOKENS.has(t))
    .map((t) => ABBREVIATIONS[t] ?? t)
}

/** Comparison key for a label, shared by the TGVmax dataset and the station reference. */
export function stationKey(label: string): string {
  return tokenize(label).join(' ')
}

/**
 * Stations missing from the French reference: foreign stations, and French ones `gares.json`
 * does not contain. Marne-la-Vallée-Chessy is one — the reference only knows the Chessy in
 * the Rhône, 358 km away, which put Disneyland next to Lyon.
 */
export const EXTRA_STATIONS: Record<string, Coords> = {
  // France — stops the rail reference does not carry: coach-served stations, stops on the
  // Ré and Oléron islands, Meuse halts.
  'marne la vallee chessy': [48.8699134, 2.7821727],
  'arcachon': [44.6589798, -1.1653219],
  'la teste': [44.6368737, -1.1431389],
  'lacanau ocean': [45.0014797, -1.1962844],
  'bourcefranc le chapus': [45.8469846, -1.1466191],
  'dolus d oleron': [45.9112189, -1.2619116],
  'marennes': [45.8224965, -1.112795],
  'st martin de re': [46.2016893, -1.3681861],
  'ste marie de re': [46.1491638, -1.3115373],
  'loix': [46.2240177, -1.4364756],
  'rivedoux plage': [46.1568361, -1.2748439],
  'les portes en re': [46.250833, -1.497222],
  'st pierre d oleron': [45.9437695, -1.3061227],
  'la noue': [48.742849, 3.6108789],
  'fresnes au mont': [48.89702, 5.44048],
  'pierrefitte sur aire': [48.9003286, 5.3299107],
  'souilly': [49.027658, 5.285761],
  'l hospitalet pres l and': [42.587865, 1.7980639],
  // Germany
  'frankfurt hbf': [50.107145, 8.663789],
  'frankfurt main hbf': [50.107145, 8.663789],
  'frankfurt am main hbf': [50.107145, 8.663789],
  'karlsruhe': [48.9931106, 8.4022064],
  'karlsruhe hbf': [48.9931106, 8.4022064],
  'mannheim': [49.4796632, 8.4698178],
  'mannheim hbf': [49.4796632, 8.4698178],
  'freiburg': [47.9977919, 7.8426094],
  'freiburg breisgau': [47.9977919, 7.8426094],
  'freiburg breisgau hbf': [47.9977919, 7.8426094],
  'freiburg hbf': [47.9977919, 7.8426094],
  'offenburg': [48.47302, 7.9455],
  'stuttgart hbf': [48.783615, 9.182902],
  'augsburg hbf': [48.3656702, 10.8862827],
  'baden baden': [48.7895302, 8.1909158],
  'berlin hbf': [52.5250175, 13.369448],
  'berlin sudkreuz': [52.4759806, 13.3650726],
  'berlin gesundbrunnen': [52.5486453, 13.3902169],
  'erfurt hbf': [50.9727731, 11.0378865],
  'esslingen neckar': [48.7397667, 9.3002039],
  'halle saale hbf': [51.4774872, 11.9872964],
  'kaiserslautern hbf': [49.4359636, 7.7680865],
  'lahr schwarzw': [48.3418287, 7.8360637],
  'munchen hbf': [48.1407253, 11.5569426],
  'ringsheim europa park': [48.2483367, 7.7732483],
  'saarbruecken sarrebruck': [49.2411972, 6.990794],
  'ulm hbf': [48.3994159, 9.9826024],
  'vaihingen enz': [48.9461895, 8.9586162],
  // Switzerland
  'geneve': [46.210017, 6.142738],
  'geneva': [46.210017, 6.142738],
  'geneve cornavin': [46.2081688, 6.1424953],
  'zurich': [47.378177, 8.540192],
  'zurich hb': [47.378177, 8.540192],
  'zurich hbf': [47.378177, 8.540192],
  'basel sbb': [47.54747, 7.58913],
  'lausanne': [46.516003, 6.629634],
  'bern': [46.94809, 7.439116],
  'sion': [46.223098, 7.357765],
  'vallorbe': [46.712326, 6.377928],
  // Belgium, Luxembourg
  'bruxelles': [50.846733, 4.35706],
  'bruxelles central': [50.846733, 4.35706],
  'bruxelles midi': [50.835694, 4.336934],
  'brussels': [50.846733, 4.35706],
  'luxembourg': [49.5996198, 6.1348882],
  // Italy, Spain, Austria
  'milano centrale': [45.485051, 9.204158],
  'milan centrale': [45.485051, 9.204158],
  'milano porta garibaldi': [45.4849, 9.1878],
  'torino porta susa': [45.07343, 7.659258],
  'oux cesana clav sestriere': [45.038731, 6.831411],
  'barcelona sants': [41.379128, 2.140478],
  'girona': [41.9791657, 2.8162865],
  'figueres vilafant': [42.2646953, 2.9426836],
  'vienna hbf': [48.18575, 16.376973],
}

/**
 * TGVmax labels matching no reference key, routed explicitly to the right entry. A readable
 * table beats a guessing heuristic: without it, "LORRAINE TGV" landed in Rai, Normandy.
 */
const LABEL_ALIASES: Record<string, string> = {
  'aeroport roissy cdg 2 tgv': 'roissy aeroport charles de gaulle 2 tgv rer',
  'lorraine tgv': 'lorraine louvigny tgv',
  'valence tgv auvergne rhone alpes': 'valence tgv',
  'nimes centre': 'nimes',
  'caussade tarn et garonne': 'caussade',
  // "st" is only two letters: with no routing, "die" was the sole hook and
  // Saint-Dié-des-Vosges landed in Die, in the Drôme.
  'st die': 'st die des vosges',
  // The département qualifier becomes a comparable word: "sevres" tied Saint-Maixent to the
  // town of Sèvres, near Paris.
  'st maixent deux sevres': 'st maixent l ecole',
  // The dataset holds a mis-encoded label, "ANGOULA<U+008A>ME", duplicating "ANGOULEME": the
  // control character drops at normalisation and leaves "angoula me".
  'angoula me': 'angouleme',
}

/** One row of the SNCF "liste-des-gares" reference file (`gares.json`). */
export interface GareRecord {
  libelle?: string
  commune?: string
  x_wgs84?: number // longitude
  y_wgs84?: number // latitude
}

export function buildCoordsIndex(records: GareRecord[]): CoordsIndex {
  const index: CoordsIndex = new Map()
  for (const g of records) {
    if (typeof g.x_wgs84 !== 'number' || typeof g.y_wgs84 !== 'number') continue
    const coords: Coords = [g.y_wgs84, g.x_wgs84]
    if (g.libelle) index.set(stationKey(g.libelle), coords)
    if (g.commune) {
      const k = stationKey(g.commune)
      if (!index.has(k)) index.set(k, coords)
    }
  }
  return index
}

/**
 * Fallback for a label no table covers — in practice, one SNCF has just added to the dataset.
 *
 * Deliberately conservative: the candidate must be **entirely contained** in the searched
 * label (each of its significant words appears there). A missing point on the map is far less
 * damaging than a wrong one — the destination stays listed either way — so when in doubt,
 * return nothing.
 */
function bestPartialMatch(index: CoordsIndex, tokens: string[]): Coords | null {
  const wanted = new Set(tokens.filter((t) => t.length >= MIN_MATCH_LEN))
  if (!wanted.size) return null

  let best: Coords | null = null
  let bestHits = 0
  let bestParts = Number.POSITIVE_INFINITY

  for (const [candidate, coords] of index) {
    const parts = candidate.split(' ')
    let hits = 0
    let contained = true
    for (const p of parts) {
      if (p.length < MIN_MATCH_LEN) continue
      if (wanted.has(p)) hits++
      else { contained = false; break }
    }
    if (!contained || !hits) continue
    // At equal word count, the shorter label is the more specific one.
    if (hits > bestHits || (hits === bestHits && parts.length < bestParts)) {
      best = coords
      bestHits = hits
      bestParts = parts.length
    }
  }
  return best
}

export type CoordsSource = 'extra' | 'alias' | 'exact' | 'partial' | 'none'

export interface CoordsMatch {
  coords: Coords | null
  /** How the label was resolved — used to check none of them relies on the fallback. */
  via: CoordsSource
}

export function resolveCoords(index: CoordsIndex, label: string): CoordsMatch {
  const key = stationKey(label)
  if (!key) return { coords: null, via: 'none' }

  const aliased = LABEL_ALIASES[key]
  const lookupKey = aliased ?? key

  const extra = EXTRA_STATIONS[lookupKey]
  if (extra) return { coords: extra, via: 'extra' }

  const exact = index.get(lookupKey)
  if (exact) return { coords: exact, via: aliased ? 'alias' : 'exact' }

  const partial = bestPartialMatch(index, lookupKey.split(' '))
  return partial ? { coords: partial, via: 'partial' } : { coords: null, via: 'none' }
}

export function lookupCoords(index: CoordsIndex, label: string): Coords | null {
  return resolveCoords(index, label).coords
}
