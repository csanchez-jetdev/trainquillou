import { cleanString } from './normalize'

export type Coords = [number, number] // [lat, lon]
export type CoordsIndex = Map<string, Coords>

/**
 * Tokens que le dataset TGVmax ajoute et que le référentiel des gares ignore.
 * « PARIS (intramuros) » désigne la ville, pas une gare précise.
 */
const NOISE_TOKENS = new Set(['intramuros'])

/** Le référentiel abrège ce que TGVmax écrit en entier : « Angers-St-Laud » / « ANGERS SAINT LAUD ». */
const ABBREVIATIONS: Record<string, string> = { saint: 'st', sainte: 'ste' }

/**
 * En repli, un mot court matche par accident : « ur » (commune d'Ur, Pyrénées) est une
 * syllabe de « frankfURt », « rai » de « lorRAIne ». On ne compare que des mots de 3 lettres
 * ou plus, et jamais en sous-chaîne.
 */
const MIN_MATCH_LEN = 3

function tokenize(label: string): string[] {
  return cleanString(label)
    .split(' ')
    .filter((t) => t && !NOISE_TOKENS.has(t))
    .map((t) => ABBREVIATIONS[t] ?? t)
}

/** Clé de comparaison d'un libellé, commune au dataset TGVmax et au référentiel des gares. */
export function stationKey(label: string): string {
  return tokenize(label).join(' ')
}

/**
 * Gares absentes du référentiel français : gares étrangères, et gares françaises que
 * `gares.json` ne contient pas. Marne-la-Vallée-Chessy en fait partie — le référentiel ne
 * connaît que le Chessy du Rhône, à 358 km, ce qui plaçait Disneyland près de Lyon.
 */
export const EXTRA_STATIONS: Record<string, Coords> = {
  // France
  'marne la vallee chessy': [48.8699134, 2.7821727],
  // Allemagne
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
  // Suisse
  'geneve': [46.210017, 6.142738],
  'geneva': [46.210017, 6.142738],
  'zurich': [47.378177, 8.540192],
  'zurich hb': [47.378177, 8.540192],
  'zurich hbf': [47.378177, 8.540192],
  'basel sbb': [47.54747, 7.58913],
  'lausanne': [46.516003, 6.629634],
  'bern': [46.94809, 7.439116],
  'sion': [46.223098, 7.357765],
  'vallorbe': [46.712326, 6.377928],
  // Belgique, Luxembourg
  'bruxelles': [50.846733, 4.35706],
  'bruxelles central': [50.846733, 4.35706],
  'bruxelles midi': [50.835694, 4.336934],
  'brussels': [50.846733, 4.35706],
  'luxembourg': [49.5996198, 6.1348882],
  // Italie, Espagne, Autriche
  'milano centrale': [45.485051, 9.204158],
  'milan centrale': [45.485051, 9.204158],
  'torino porta susa': [45.07343, 7.659258],
  'barcelona sants': [41.379128, 2.140478],
  'vienna hbf': [48.18575, 16.376973],
}

/**
 * Libellés TGVmax qui ne correspondent à aucune clé du référentiel, aiguillés explicitement
 * vers la bonne entrée. Une table lisible vaut mieux qu'une heuristique qui devine : sans elle,
 * « LORRAINE TGV » atterrissait dans la commune de Rai, en Normandie.
 */
const LABEL_ALIASES: Record<string, string> = {
  'aeroport roissy cdg 2 tgv': 'roissy aeroport charles de gaulle 2 tgv rer',
  'lorraine tgv': 'lorraine louvigny tgv',
  'valence tgv auvergne rhone alpes': 'valence tgv',
  'nimes centre': 'nimes',
  'caussade tarn et garonne': 'caussade',
}

export function buildCoordsIndex(records: Array<{ libelle?: string; commune?: string; x_wgs84?: number; y_wgs84?: number }>): CoordsIndex {
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
 * Repli pour un libellé qu'aucune table ne couvre — en pratique, un libellé que SNCF vient
 * d'ajouter au dataset.
 *
 * Délibérément conservateur : le candidat retenu doit être **entièrement contenu** dans le
 * libellé cherché (chacun de ses mots significatifs y figure). Un point manquant sur la carte
 * est bien moins grave qu'un point faux — la destination reste listée dans les résultats — donc
 * en cas de doute on ne renvoie rien.
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
    // À nombre de mots reconnus égal, le libellé le plus court est le plus spécifique.
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
  /** Par quel chemin le libellé a été résolu — utile pour vérifier qu'aucun ne repose sur le repli. */
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
