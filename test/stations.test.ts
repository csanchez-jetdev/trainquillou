import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildCoordsIndex,
  lookupCoords,
  resolveCoords,
  stationKey,
  EXTRA_STATIONS,
  type Coords,
} from '~~/server/utils/stations'

const read = (p: string) => JSON.parse(readFileSync(resolve(process.cwd(), p), 'utf8'))

/** Référentiel complet embarqué : c'est contre lui que les libellés réels doivent tomber juste. */
const gares = read('server/assets/gares.json')
const index = buildCoordsIndex(gares)

/** Les 103 libellés réellement présents dans le dataset TGVmax (facettes origine + destination). */
const TGVMAX_LABELS: string[] = read('test/fixtures/tgvmax-labels.json')

/** Distance approximative en km — suffisant pour vérifier qu'une gare est au bon endroit. */
function distanceKm([lat1, lon1]: Coords, [lat2, lon2]: Coords): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a
    = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function expectNear(label: string, expected: Coords, toleranceKm = 15) {
  const got = lookupCoords(index, label)
  expect(got, `${label} n'a pas été résolu`).not.toBeNull()
  const d = distanceKm(got!, expected)
  expect(d, `${label} résolu à ${d.toFixed(0)} km du point attendu`).toBeLessThan(toleranceKm)
}

describe('stationKey', () => {
  it('retire le marqueur intramuros propre au dataset TGVmax', () => {
    expect(stationKey('PARIS (intramuros)')).toBe('paris')
  })

  it('aligne « Saint » sur l\'abréviation « St » du référentiel', () => {
    expect(stationKey('ANGERS SAINT LAUD')).toBe('angers st laud')
    expect(stationKey('Angers-St-Laud')).toBe('angers st laud')
  })

  it('produit la même clé de part et d\'autre des deux référentiels', () => {
    expect(stationKey('MONTPELLIER SAINT ROCH')).toBe(stationKey('Montpellier-St-Roch'))
  })

  it('renvoie une chaîne vide pour une entrée vide', () => {
    expect(stationKey('')).toBe('')
    expect(stationKey('   ')).toBe('')
  })
})

describe('lookupCoords — régressions de placement sur la carte', () => {
  it('place Frankfurt en Allemagne, pas dans la commune d\'Ur (Pyrénées)', () => {
    expectNear('FRANKFURT AM MAIN HBF', [50.107145, 8.663789])
  })

  it('place Lorraine TGV en Moselle, pas dans la commune de Rai (Normandie)', () => {
    expectNear('LORRAINE TGV', [48.9494, 6.1699])
  })

  it('place Roissy CDG 2 à l\'aéroport, pas à Issy ni à Troissy', () => {
    expectNear('AEROPORT ROISSY CDG 2 TGV', [49.0043, 2.5713])
  })

  it('place Marne-la-Vallée-Chessy en Seine-et-Marne, pas au Chessy du Rhône', () => {
    expectNear('MARNE LA VALLEE CHESSY', [48.8699, 2.7822])
  })

  it('place Nîmes dans le Gard, pas à Grigny-Centre', () => {
    expectNear('NIMES CENTRE', [43.8318, 4.3661])
  })

  it('résout Karlsruhe et Mannheim, jusqu\'ici sans coordonnées du tout', () => {
    expectNear('KARLSRUHE HBF', [48.9931106, 8.4022064])
    expectNear('MANNHEIM HBF', [49.4796632, 8.4698178])
  })
})

describe('lookupCoords — choix entre candidats proches', () => {
  it('préfère Valence-TGV à la gare de Valence centre', () => {
    expectNear('VALENCE TGV AUVERGNE RHONE ALPES', [44.9911, 4.9793], 5)
  })

  it('préfère la Caussade du Tarn-et-Garonne à son homonyme des Hautes-Pyrénées', () => {
    expectNear('CAUSSADE(TARN ET GARONNE)', [44.1618, 1.5372], 10)
  })

  it('résout les libellés « Saint » écrits en entier', () => {
    expectNear('ANGERS SAINT LAUD', [47.4646, -0.5581], 5)
    expectNear('MONTPELLIER SAINT ROCH', [43.6045, 3.8807], 5)
  })

  it('résout les libellés intramuros vers leur ville', () => {
    expectNear('PARIS (intramuros)', [48.8566, 2.3522])
    expectNear('LYON (intramuros)', [45.7578, 4.832])
    expectNear('LILLE (intramuros)', [50.6292, 3.0573])
  })
})

describe('bestPartialMatch — le repli refuse de deviner', () => {
  it('ne renvoie rien plutôt qu\'un point faux pour un libellé sans rapport', () => {
    expect(lookupCoords(index, 'ZZZZZ QUELQUE PART')).toBeNull()
    expect(lookupCoords(index, 'GARE INEXISTANTE XYZ')).toBeNull()
  })

  it('ne matche jamais un mot de moins de 3 lettres', () => {
    // Sans ce garde-fou, « ur » et « rai » attrapaient des libellés entiers.
    expect(resolveCoords(index, 'XX YY').via).toBe('none')
  })

  it('ne renvoie rien pour un libellé vide', () => {
    expect(lookupCoords(index, '')).toBeNull()
    expect(lookupCoords(index, '  ')).toBeNull()
  })
})

describe('couverture du dataset TGVmax', () => {
  it('contient bien les 103 libellés attendus', () => {
    expect(TGVMAX_LABELS.length).toBe(103)
  })

  it('résout les 103 libellés sans exception', () => {
    const unresolved = TGVMAX_LABELS.filter((l) => lookupCoords(index, l) === null)
    expect(unresolved, `libellés sans coordonnées : ${unresolved.join(', ')}`).toEqual([])
  })

  it('résout les 103 libellés de façon déterministe, sans recourir au repli', () => {
    // Le repli est un filet de sécurité pour un libellé que SNCF viendrait d'ajouter, pas
    // un chemin nominal. Si ce test casse, c'est qu'un nouveau libellé est apparu : il faut
    // lui ajouter un alias ou une entrée EXTRA_STATIONS plutôt que laisser l'heuristique deviner.
    const heuristic = TGVMAX_LABELS.filter((l) => resolveCoords(index, l).via === 'partial')
    expect(heuristic, `libellés résolus par heuristique : ${heuristic.join(', ')}`).toEqual([])
  })

  it('place les 103 libellés dans une zone géographique plausible', () => {
    // France métropolitaine + pays desservis par TGVmax.
    const outside = TGVMAX_LABELS.filter((l) => {
      const c = lookupCoords(index, l)
      if (!c) return false
      const [lat, lon] = c
      return lat < 41 || lat > 52.5 || lon < -5 || lon > 17
    })
    expect(outside, `libellés hors zone : ${outside.join(', ')}`).toEqual([])
  })
})

describe('cohérence des tables de résolution', () => {
  it('tous les alias pointent vers une clé existante du référentiel', () => {
    // Un alias mal orthographié retomberait silencieusement sur l'heuristique.
    const aliasedLabels = ['AEROPORT ROISSY CDG 2 TGV', 'LORRAINE TGV', 'VALENCE TGV AUVERGNE RHONE ALPES', 'NIMES CENTRE', 'CAUSSADE(TARN ET GARONNE)']
    for (const label of aliasedLabels) {
      expect(resolveCoords(index, label).via, `${label} ne passe pas par son alias`).toBe('alias')
    }
  })

  it('les clés d\'EXTRA_STATIONS sont déjà normalisées', () => {
    for (const key of Object.keys(EXTRA_STATIONS)) {
      expect(stationKey(key), `clé non normalisée : ${key}`).toBe(key)
    }
  })

  it('les coordonnées d\'EXTRA_STATIONS sont dans l\'ordre [lat, lon]', () => {
    for (const [key, [lat, lon]] of Object.entries(EXTRA_STATIONS)) {
      expect(lat, `${key} : latitude hors plage`).toBeGreaterThan(40)
      expect(lat, `${key} : latitude hors plage`).toBeLessThan(53)
      expect(lon, `${key} : longitude hors plage`).toBeGreaterThan(-5)
      expect(lon, `${key} : longitude hors plage`).toBeLessThan(17)
    }
  })
})

describe('buildCoordsIndex', () => {
  it('parse entièrement le référentiel (le fichier a déjà été livré tronqué)', () => {
    expect(Array.isArray(gares)).toBe(true)
    expect(gares.length).toBeGreaterThan(6000)
  })

  it('ignore les enregistrements sans coordonnées exploitables', () => {
    const built = buildCoordsIndex([
      { libelle: 'Sans coords', commune: 'NULLE PART' },
      { libelle: 'Coords partielles', commune: 'AILLEURS', x_wgs84: 2 },
      { libelle: 'Valide', commune: 'ICI', x_wgs84: 2.35, y_wgs84: 48.85 },
    ])
    expect(built.has('sans coords')).toBe(false)
    expect(built.has('coords partielles')).toBe(false)
    expect(built.get('valide')).toEqual([48.85, 2.35])
  })

  it('convertit x_wgs84/y_wgs84 en [lat, lon]', () => {
    const built = buildCoordsIndex([{ libelle: 'Test', x_wgs84: 2.3735, y_wgs84: 48.8443 }])
    expect(built.get('test')).toEqual([48.8443, 2.3735])
  })

  it('ne laisse pas une commune écraser une gare de même clé', () => {
    const built = buildCoordsIndex([
      { libelle: 'Chessy', commune: 'CHESSY', x_wgs84: 4.62249, y_wgs84: 45.88544 },
    ])
    expect(built.get('chessy')).toEqual([45.88544, 4.62249])
  })
})
