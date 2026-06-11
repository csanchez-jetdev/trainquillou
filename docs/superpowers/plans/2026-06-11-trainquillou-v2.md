# Trainquillou v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconstruire Trainquille en v2 open source et gratuite — un chercheur de destinations TGVmax map-first, sans paywall ni login.

**Architecture:** Nuxt 4 (Vue 3, TS). Le client ne parle qu'aux routes serveur Nitro (`/api/*`) qui proxifient, cachent et normalisent l'open data SNCF. Les coordonnées des gares sont résolues côté serveur depuis un référentiel embarqué. L'URL (`?origin=&date=`) est la source de vérité ; carte MapLibre GL en fond, recherche flottante + rail de résultats par-dessus (Direction A).

**Tech Stack:** Nuxt 4, TypeScript, Tailwind v4 (`@tailwindcss/vite`), MapLibre GL, Nitro (`defineCachedEventHandler`), Vitest + `@nuxt/test-utils`, pnpm. Données : SNCF Explore API v2.1 (dataset `tgvmax`) + référentiel `liste-des-gares`.

**Référence design :** `docs/superpowers/specs/2026-06-10-trainquillou-v2-design.md`. Code v1 (lecture seule) : `../v1/`.

---

## Faits vérifiés (ne pas re-deviner)

- **Endpoint records :** `GET https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax/records`
  - Filtre validé : `refine=date:2026-06-20&refine=od_happy_card:OUI&where=origine like "PARIS"&limit=100`
  - Champs d'un record (à plat dans `results[]`) : `date`, `train_no`, `origine`, `destination`, `heure_depart` (`"14:58"`), `heure_arrivee`, `od_happy_card` (`"OUI"`/`"NON"`), `origine_iata`, `destination_iata`, `axe`, `entity`.
  - `limit` max = 100 ; `total_count` indique le total. Une origine+date dépasse rarement 100 trains réservables (Paris = 51). Si `total_count > 100`, paginer via `offset`.
  - **Piège :** `where date="..."` échoue (`IncompatibleTypesInComparisonFilter`). Toujours filtrer la date via `refine=date:YYYY-MM-DD`.
- **Liste des gares :** `GET .../tgvmax/facets?facet=origine` → `facets[0].facets[]` = `[{ name: "PARIS (intramuros)", count }]` (~100 valeurs, cap à 100). Union avec `facet=destination` pour couvrir les gares qui ne sont jamais origine.
- **Référentiel coords :** `gares.json` = tableau d'objets `{ libelle, commune, x_wgs84 (lon), y_wgs84 (lat), ... }`.
- **Gares étrangères :** dictionnaire en dur repris de v1 (voir Task 5).

---

## File Structure

```
trainquillou/
├── nuxt.config.ts                      # MODIFY : Tailwind vite plugin, css, app meta
├── vitest.config.ts                    # CREATE : config tests Nuxt
├── package.json                        # MODIFY : deps + script "test"
├── LICENSE                             # CREATE : AGPL-3.0
├── README.md                           # MODIFY : pitch + setup + attributions
├── shared/
│   └── types.ts                        # CREATE : types partagés client/serveur
├── app/
│   ├── app.vue                         # MODIFY : <NuxtPage/> + reset global
│   ├── assets/css/main.css             # CREATE : @import tailwind + tokens
│   ├── pages/
│   │   └── index.vue                   # CREATE : page unique map-first
│   ├── composables/
│   │   ├── useStations.ts              # CREATE
│   │   ├── useSearch.ts                # CREATE
│   │   └── useReturns.ts               # CREATE
│   └── components/
│       ├── SearchBar.vue               # CREATE
│       ├── ResultsRail.vue             # CREATE
│       ├── DestinationCard.vue         # CREATE
│       ├── ReturnDates.vue             # CREATE
│       └── MapView.client.vue          # CREATE
├── server/
│   ├── assets/gares.json               # CREATE : copie COMPLÈTE du référentiel
│   ├── utils/
│   │   ├── normalize.ts                # CREATE : normalisation libellés
│   │   ├── stations.ts                 # CREATE : index coords + gares étrangères
│   │   └── sncf.ts                     # CREATE : appels Explore API v2.1
│   └── api/
│       ├── stations.get.ts             # CREATE
│       ├── search.get.ts               # CREATE
│       └── returns.get.ts              # CREATE
└── test/
    ├── normalize.test.ts
    ├── stations.test.ts
    ├── sncf.test.ts
    ├── SearchBar.test.ts
    └── DestinationCard.test.ts
```

---

## Phase 0 — Setup

### Task 1: Tailwind v4 + app shell

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `nuxt.config.ts`
- Create: `app/assets/css/main.css`
- Modify: `app/app.vue`
- Create: `app/pages/index.vue`

- [ ] **Step 1: Installer les dépendances runtime**

Run:
```bash
cd /Users/ippon/perso-workspace/tranquille/trainquillou
pnpm add tailwindcss @tailwindcss/vite maplibre-gl
```

- [ ] **Step 2: Configurer Nuxt**

Replace `nuxt.config.ts` with:
```ts
import tailwindcss from '@tailwindcss/vite'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  vite: { plugins: [tailwindcss()] },
  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: 'Trainquillou — destinations TGVmax, gratuit et sans compte',
      meta: [
        { name: 'description', content: 'Trouvez les destinations TGVmax réservables depuis votre gare, sur une carte. 100% gratuit, sans paywall, sans compte.' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1' },
      ],
    },
  },
})
```

- [ ] **Step 3: CSS de base + tokens**

Create `app/assets/css/main.css`:
```css
@import "tailwindcss";

@theme {
  --color-rail: #0a2540;
  --color-rail-soft: #1b3a5b;
  --color-accent: #00b8a9;
  --color-accent-strong: #009688;
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
}

html, body, #__nuxt { height: 100%; }
body { margin: 0; background: #f6f8fb; color: var(--color-rail); }
```

- [ ] **Step 4: App shell**

Replace `app/app.vue` with:
```vue
<template>
  <NuxtPage />
</template>
```

Create `app/pages/index.vue` (placeholder, étoffé plus tard) :
```vue
<template>
  <main class="grid h-screen place-items-center">
    <h1 class="text-3xl font-bold text-rail">Trainquillou</h1>
  </main>
</template>
```

- [ ] **Step 5: Vérifier que le dev server démarre**

Run: `pnpm dev` (laisser tourner ~5s, vérifier "Local: http://localhost:3000", puis Ctrl-C)
Expected: build sans erreur, pas d'avertissement Tailwind.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: set up Tailwind v4, MapLibre dep, and app shell"
```

---

### Task 2: Harnais de tests + types partagés + licence

**Files:**
- Modify: `package.json` (devDeps + script)
- Create: `vitest.config.ts`
- Create: `shared/types.ts`
- Create: `LICENSE`
- Modify: `README.md`

- [ ] **Step 1: Installer les deps de test**

Run:
```bash
pnpm add -D vitest @nuxt/test-utils @vue/test-utils happy-dom
```

- [ ] **Step 2: Config Vitest**

Create `vitest.config.ts`:
```ts
import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
  },
})
```

Add to `package.json` `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Types partagés**

Create `shared/types.ts`:
```ts
export interface Train {
  departure: string // "14:58"
  arrival: string // "17:48"
  trainNumber: string | null
}

export interface Destination {
  label: string
  coords: [number, number] | null // [lat, lon]
  trains: Train[]
}

export interface SearchResult {
  origin: { label: string; coords: [number, number] | null }
  date: string // YYYY-MM-DD
  destinations: Destination[]
}

export interface ReturnDatesResult {
  origin: string
  destination: string
  dates: string[] // YYYY-MM-DD, triées croissantes
}
```

- [ ] **Step 4: Test de fumée du harnais**

Create `test/normalize.test.ts` (temporaire, remplacé en Task 3) :
```ts
import { describe, it, expect } from 'vitest'

describe('harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `pnpm test`
Expected: 1 passed.

- [ ] **Step 5: Licence AGPL-3.0**

Run (récupère le texte officiel) :
```bash
curl -fsSL https://www.gnu.org/licenses/agpl-3.0.txt -o LICENSE
head -3 LICENSE
```
Expected: l'en-tête "GNU AFFERO GENERAL PUBLIC LICENSE / Version 3, 19 November 2007".
Si pas de réseau : créer `LICENSE` avec le texte AGPL-3.0 complet manuellement.

- [ ] **Step 6: README**

Replace `README.md` with:
```markdown
# Trainquillou

Trouvez les destinations **TGVmax** réservables depuis votre gare, sur une carte interactive.
**100% gratuit, sans paywall, sans compte.**

## Stack

Nuxt 4 · TypeScript · Tailwind v4 · MapLibre GL · open data SNCF.

## Développement

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm test     # tests unitaires + composants
pnpm build    # build production
```

## Données & attributions

- Disponibilités TGVmax : [open data SNCF — dataset `tgvmax`](https://data.sncf.com/explore/dataset/tgvmax/).
- Coordonnées des gares : référentiel SNCF « liste-des-gares ».
- Fonds de carte : OpenStreetMap, rendu MapLibre GL.

Données sous licence ouverte / ODbL. Voir attributions dans l'application.

## Licence

[AGPL-3.0](./LICENSE). Toute version hébergée modifiée doit republier son code source.
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add Vitest harness, shared types, AGPL-3.0 license, README"
```

---

## Phase 1 — Couche serveur

### Task 3: Util de normalisation de libellés

**Files:**
- Create: `server/utils/normalize.ts`
- Test: `test/normalize.test.ts` (remplace le smoke test)

- [ ] **Step 1: Écrire les tests qui échouent**

Replace `test/normalize.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { cleanString, sameStation } from '~~/server/utils/normalize'

describe('cleanString', () => {
  it('lowercases, strips accents and punctuation', () => {
    expect(cleanString('Saint-Étienne-Châteaucreux')).toBe('saint etienne chateaucreux')
  })
  it('collapses parentheses and extra spaces', () => {
    expect(cleanString('PARIS (intramuros)')).toBe('paris intramuros')
  })
  it('handles empty input', () => {
    expect(cleanString('')).toBe('')
  })
})

describe('sameStation', () => {
  it('matches identical normalized labels', () => {
    expect(sameStation('PARIS (intramuros)', 'paris intramuros')).toBe(true)
  })
  it('matches by containment', () => {
    expect(sameStation('LYON (intramuros)', 'Lyon')).toBe(true)
  })
  it('rejects unrelated labels', () => {
    expect(sameStation('NANTES', 'RENNES')).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `pnpm test normalize`
Expected: FAIL — `cleanString`/`sameStation` introuvables.

- [ ] **Step 3: Implémentation minimale**

Create `server/utils/normalize.ts`:
```ts
/** Minuscule, sans accents, sans ponctuation, espaces compactés. */
export function cleanString(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run: `pnpm test normalize`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/normalize.ts test/normalize.test.ts
git commit -m "feat: add station label normalization utils"
```

---

### Task 4: (placeholder de copie) Référentiel des gares

**Files:**
- Create: `server/assets/gares.json`

- [ ] **Step 1: Vérifier l'intégrité du `gares.json` source**

Run:
```bash
node -e "const d=require('../v1/gares.json'); console.log('records:', d.length)" 2>&1 | tail -1
```
Expected: un nombre (ex. > 3000). **Si erreur `Unterminated string`/`Unexpected end`**, le fichier `../v1/gares.json` est tronqué (limite d'upload 1 Mo) : STOP, demander la version complète avant de continuer. Le reste de la phase 1 (Tasks 3, 5, 6) ne dépend PAS de ce fichier et peut avancer ; seules les coordonnées (search enrichi, carte) en dépendent.

- [ ] **Step 2: Copier dans les assets serveur**

Run:
```bash
mkdir -p server/assets
cp ../v1/gares.json server/assets/gares.json
node -e "const d=require('./server/assets/gares.json'); console.log('ok records:', d.length, 'sample:', d[0].libelle)"
```
Expected: affiche le nombre de gares et un libellé.

- [ ] **Step 3: Commit**

```bash
git add server/assets/gares.json
git commit -m "chore: embed SNCF station coordinate reference (gares.json)"
```

---

### Task 5: Index de coordonnées des gares

**Files:**
- Create: `server/utils/stations.ts`
- Test: `test/stations.test.ts`

- [ ] **Step 1: Écrire les tests qui échouent**

Create `test/stations.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildCoordsIndex, lookupCoords, FOREIGN_STATIONS } from '~~/server/utils/stations'

const SAMPLE = [
  { libelle: 'Lyon', commune: 'LYON', x_wgs84: 4.8357, y_wgs84: 45.7640 },
  { libelle: 'Nantes', commune: 'NANTES', x_wgs84: -1.5536, y_wgs84: 47.2184 },
]

describe('buildCoordsIndex + lookupCoords', () => {
  const index = buildCoordsIndex(SAMPLE)

  it('returns [lat, lon] for an exact label', () => {
    expect(lookupCoords(index, 'LYON (intramuros)')).toEqual([45.764, 4.8357])
  })
  it('falls back to a foreign station dictionary', () => {
    expect(lookupCoords(index, 'Genève')).toEqual(FOREIGN_STATIONS['geneve'])
  })
  it('returns null when unknown', () => {
    expect(lookupCoords(index, 'Pôle Nord')).toBeNull()
  })
  it('ignores reference rows without coordinates', () => {
    const idx = buildCoordsIndex([{ libelle: 'Vide', commune: 'VIDE' } as any])
    expect(lookupCoords(idx, 'Vide')).toBeNull()
  })
})
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `pnpm test stations`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémentation**

Create `server/utils/stations.ts`:
```ts
import { cleanString } from './normalize'

export interface GareRecord {
  libelle?: string
  commune?: string
  x_wgs84?: number // longitude
  y_wgs84?: number // latitude
}

export type Coords = [number, number] // [lat, lon]
export type CoordsIndex = Map<string, Coords>

/** Gares hors référentiel français (repris de v1). Clés = cleanString(libellé). */
export const FOREIGN_STATIONS: Record<string, Coords> = {
  'freiburg': [47.9977919, 7.8426094],
  'freiburg breisgau': [47.9977919, 7.8426094],
  'freiburg breisgau hbf': [47.9977919, 7.8426094],
  'freiburg hbf': [47.9977919, 7.8426094],
  'geneve': [46.210017, 6.142738],
  'geneva': [46.210017, 6.142738],
  'zurich': [47.378177, 8.540192],
  'zurich hb': [47.378177, 8.540192],
  'zurich hbf': [47.378177, 8.540192],
  'bruxelles midi': [50.835694, 4.336934],
  'bruxelles central': [50.846733, 4.35706],
  'bruxelles': [50.846733, 4.35706],
  'brussels': [50.846733, 4.35706],
  'milano centrale': [45.485051, 9.204158],
  'milan centrale': [45.485051, 9.204158],
  'luxembourg': [49.5996198, 6.1348882],
  'barcelona sants': [41.379128, 2.140478],
  'basel sbb': [47.54747, 7.58913],
  'frankfurt main hbf': [50.107145, 8.663789],
  'frankfurt hbf': [50.107145, 8.663789],
  'lausanne': [46.516003, 6.629634],
  'offenburg': [48.47302, 7.9455],
  'bern': [46.94809, 7.439116],
  'stuttgart hbf': [48.783615, 9.182902],
  'torino porta susa': [45.07343, 7.659258],
  'vienna hbf': [48.18575, 16.376973],
  'sion': [46.223098, 7.357765],
  'vallorbe': [46.712326, 6.377928],
}

/** Construit un index clé normalisée -> [lat, lon] depuis le référentiel. */
export function buildCoordsIndex(records: GareRecord[]): CoordsIndex {
  const index: CoordsIndex = new Map()
  for (const g of records) {
    if (typeof g.x_wgs84 !== 'number' || typeof g.y_wgs84 !== 'number') continue
    const coords: Coords = [g.y_wgs84, g.x_wgs84]
    if (g.libelle) index.set(cleanString(g.libelle), coords)
    if (g.commune) {
      const k = cleanString(g.commune)
      if (!index.has(k)) index.set(k, coords)
    }
  }
  return index
}

/** Résout les coordonnées d'un libellé : étrangères -> exact -> 1er mot -> null. */
export function lookupCoords(index: CoordsIndex, label: string): Coords | null {
  const key = cleanString(label)
  if (!key) return null
  if (FOREIGN_STATIONS[key]) return FOREIGN_STATIONS[key]
  if (index.has(key)) return index.get(key)!
  const first = key.split(' ')[0]
  for (const [k, v] of index) {
    if (k.startsWith(first) || k.includes(key) || key.includes(k)) return v
  }
  return null
}
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run: `pnpm test stations`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/stations.ts test/stations.test.ts
git commit -m "feat: add station coordinate index with foreign-station fallback"
```

---

### Task 6: Util d'accès SNCF (Explore API v2.1)

**Files:**
- Create: `server/utils/sncf.ts`
- Test: `test/sncf.test.ts`

Ce module encapsule TOUTE la spécificité SNCF. On teste la logique de transformation en injectant un `fetch` factice (pas d'appel réseau en test).

- [ ] **Step 1: Écrire les tests qui échouent**

Create `test/sncf.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { groupReservableTrains, type RawRecord } from '~~/server/utils/sncf'

const RAW: RawRecord[] = [
  { origine: 'PARIS (intramuros)', destination: 'LYON (intramuros)', heure_depart: '09:00', heure_arrivee: '11:00', train_no: '6601', od_happy_card: 'OUI', date: '2026-06-20' },
  { origine: 'PARIS (intramuros)', destination: 'LYON (intramuros)', heure_depart: '07:00', heure_arrivee: '09:00', train_no: '6605', od_happy_card: 'OUI', date: '2026-06-20' },
  { origine: 'PARIS (intramuros)', destination: 'NANTES', heure_depart: '08:00', heure_arrivee: '10:00', train_no: '8801', od_happy_card: 'OUI', date: '2026-06-20' },
]

describe('groupReservableTrains', () => {
  it('groups by destination and sorts trains by departure time', () => {
    const out = groupReservableTrains(RAW)
    expect(out.map((d) => d.label)).toEqual(['LYON (intramuros)', 'NANTES'])
    expect(out[0].trains.map((t) => t.departure)).toEqual(['07:00', '09:00'])
    expect(out[0].trains[0]).toMatchObject({ departure: '07:00', arrival: '09:00', trainNumber: '6605' })
  })
  it('returns empty array for no records', () => {
    expect(groupReservableTrains([])).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `pnpm test sncf`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémentation**

Create `server/utils/sncf.ts`:
```ts
import type { Destination, Train } from '~~/shared/types'

const BASE = 'https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax'
const PAGE = 100

export interface RawRecord {
  date: string
  train_no: string
  origine: string
  destination: string
  heure_depart: string
  heure_arrivee: string
  od_happy_card: 'OUI' | 'NON'
}

interface RecordsResponse {
  total_count: number
  results: RawRecord[]
}

/** Récupère toutes les pages de records pour des paramètres donnés. */
export async function fetchRecords(query: Record<string, string | string[]>): Promise<RawRecord[]> {
  const all: RawRecord[] = []
  let offset = 0
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = new URL(`${BASE}/records`)
    for (const [k, v] of Object.entries(query)) {
      if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x))
      else url.searchParams.set(k, v)
    }
    url.searchParams.set('limit', String(PAGE))
    url.searchParams.set('offset', String(offset))
    const res = await $fetch<RecordsResponse>(url.toString())
    all.push(...(res.results || []))
    offset += PAGE
    if (offset >= (res.total_count || 0) || offset >= 10000) break
  }
  return all
}

/** Groupe des records réservables par destination, trains triés par départ. */
export function groupReservableTrains(records: RawRecord[]): Destination[] {
  const byDest = new Map<string, Train[]>()
  for (const r of records) {
    if (r.od_happy_card !== 'OUI') continue
    const list = byDest.get(r.destination) || []
    list.push({ departure: r.heure_depart, arrival: r.heure_arrivee, trainNumber: r.train_no || null })
    byDest.set(r.destination, list)
  }
  return [...byDest.entries()]
    .map(([label, trains]) => ({
      label,
      coords: null as Destination['coords'],
      trains: trains.sort((a, b) => a.departure.localeCompare(b.departure)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

/** Liste des libellés de gares (union origines + destinations). */
export async function fetchStationLabels(): Promise<string[]> {
  const labels = new Set<string>()
  for (const facet of ['origine', 'destination']) {
    const res = await $fetch<{ facets: Array<{ name: string; facets: Array<{ name: string }> }> }>(
      `${BASE}/facets`,
      { query: { facet } },
    )
    const group = res.facets?.find((f) => f.name === facet)
    group?.facets?.forEach((x) => labels.add(x.name))
  }
  return [...labels].sort((a, b) => a.localeCompare(b))
}

/** Disponibilités TGVmax réservables depuis une origine à une date. */
export async function fetchOutbound(origin: string, date: string): Promise<RawRecord[]> {
  return fetchRecords({
    refine: [`date:${date}`, 'od_happy_card:OUI'],
    where: `origine like "${origin.replace(/"/g, '')}"`,
  })
}

/** Dates de retour réservables pour un trajet (origine = destination de l'aller). */
export async function fetchReturnDates(origin: string, destination: string, from: string): Promise<string[]> {
  const records = await fetchRecords({
    refine: ['od_happy_card:OUI'],
    where: `origine like "${origin.replace(/"/g, '')}" and destination like "${destination.replace(/"/g, '')}" and date >= date'${from}'`,
  })
  return [...new Set(records.map((r) => r.date))].sort()
}
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run: `pnpm test sncf`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/sncf.ts test/sncf.test.ts
git commit -m "feat: add SNCF Explore API client and reservable-train grouping"
```

---

### Task 7: Route `/api/stations`

**Files:**
- Create: `server/api/stations.get.ts`

- [ ] **Step 1: Implémenter la route (cache 6h)**

Create `server/api/stations.get.ts`:
```ts
import { fetchStationLabels } from '~~/server/utils/sncf'

export default defineCachedEventHandler(
  async (): Promise<string[]> => {
    return fetchStationLabels()
  },
  { maxAge: 60 * 60 * 6, name: 'stations', getKey: () => 'all' },
)
```

- [ ] **Step 2: Vérifier en conditions réelles**

Run (dans un terminal, `pnpm dev` tournant) :
```bash
curl -s http://localhost:3000/api/stations | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('count:',j.length,'| sample:',j.slice(0,3))})"
```
Expected: `count:` ~100+ et des libellés type `PARIS (intramuros)`.

- [ ] **Step 3: Commit**

```bash
git add server/api/stations.get.ts
git commit -m "feat: add cached /api/stations endpoint"
```

---

### Task 8: Route `/api/search`

**Files:**
- Create: `server/api/search.get.ts`

- [ ] **Step 1: Implémenter la route**

Create `server/api/search.get.ts`:
```ts
import { fetchOutbound, groupReservableTrains } from '~~/server/utils/sncf'
import { buildCoordsIndex, lookupCoords, type CoordsIndex } from '~~/server/utils/stations'
import type { SearchResult } from '~~/shared/types'

let coordsIndex: CoordsIndex | null = null
async function getCoordsIndex(): Promise<CoordsIndex> {
  if (!coordsIndex) {
    const records = (await useStorage('assets:server').getItem('gares.json')) as any[]
    coordsIndex = buildCoordsIndex(records || [])
  }
  return coordsIndex
}

export default defineCachedEventHandler(
  async (event): Promise<SearchResult> => {
    const { origin, date } = getQuery(event) as { origin?: string; date?: string }
    if (!origin || !date) {
      throw createError({ statusCode: 400, statusMessage: 'origin and date are required' })
    }
    const index = await getCoordsIndex()
    const raw = await fetchOutbound(origin, date)
    const destinations = groupReservableTrains(raw).map((d) => ({
      ...d,
      coords: lookupCoords(index, d.label),
    }))
    return {
      origin: { label: origin, coords: lookupCoords(index, origin) },
      date,
      destinations,
    }
  },
  {
    maxAge: 60 * 10,
    name: 'search',
    getKey: (event) => {
      const q = getQuery(event)
      return `${q.origin}|${q.date}`
    },
  },
)
```

> **Note Nitro :** les fichiers de `server/assets/` sont exposés via `useStorage('assets:server')`. Vérifier au Step 2 que `getItem('gares.json')` renvoie bien le tableau parsé ; si la valeur est une chaîne, faire `JSON.parse`.

- [ ] **Step 2: Vérifier en conditions réelles**

Run (avec `pnpm dev`, date dans ~10 jours) :
```bash
curl -s "http://localhost:3000/api/search?origin=PARIS%20(intramuros)&date=2026-06-20" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('origin:',j.origin);console.log('nb dest:',j.destinations.length);console.log('ex:',j.destinations[0])})"
```
Expected: `origin` avec coords non nulles, `nb dest > 0`, première destination avec `trains[]` et `coords` (si la gare est dans le référentiel).

- [ ] **Step 3: Commit**

```bash
git add server/api/search.get.ts
git commit -m "feat: add cached /api/search endpoint with coordinate enrichment"
```

---

### Task 9: Route `/api/returns`

**Files:**
- Create: `server/api/returns.get.ts`

- [ ] **Step 1: Implémenter la route**

Create `server/api/returns.get.ts`:
```ts
import { fetchReturnDates } from '~~/server/utils/sncf'
import type { ReturnDatesResult } from '~~/shared/types'

export default defineCachedEventHandler(
  async (event): Promise<ReturnDatesResult> => {
    const { origin, dest, from } = getQuery(event) as { origin?: string; dest?: string; from?: string }
    if (!origin || !dest || !from) {
      throw createError({ statusCode: 400, statusMessage: 'origin, dest and from are required' })
    }
    const dates = await fetchReturnDates(origin, dest, from)
    return { origin, destination: dest, dates }
  },
  {
    maxAge: 60 * 10,
    name: 'returns',
    getKey: (event) => {
      const q = getQuery(event)
      return `${q.origin}|${q.dest}|${q.from}`
    },
  },
)
```

- [ ] **Step 2: Vérifier en conditions réelles**

Run (origin = une destination trouvée à la Task 8) :
```bash
curl -s "http://localhost:3000/api/returns?origin=LYON%20(intramuros)&dest=PARIS%20(intramuros)&from=2026-06-20" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('nb dates:',j.dates.length,'| ex:',j.dates.slice(0,5))})"
```
Expected: un tableau de dates ISO triées (peut être vide selon disponibilités, ce qui reste valide).

- [ ] **Step 3: Commit**

```bash
git add server/api/returns.get.ts
git commit -m "feat: add cached /api/returns endpoint"
```

---

## Phase 2 — Recherche + rail de résultats

### Task 10: Composable `useStations` (autocomplétion)

**Files:**
- Create: `app/composables/useStations.ts`

- [ ] **Step 1: Implémenter**

Create `app/composables/useStations.ts`:
```ts
import { cleanString } from '~~/server/utils/normalize'

export function useStations() {
  const { data: stations } = useFetch<string[]>('/api/stations', {
    key: 'stations',
    default: () => [],
    server: false,
  })

  /** Renvoie jusqu'à `limit` suggestions classées (préfixe avant inclusion). */
  function suggest(input: string, limit = 8): string[] {
    const q = cleanString(input)
    if (q.length < 1) return []
    const list = stations.value || []
    const starts: string[] = []
    const contains: string[] = []
    for (const s of list) {
      const c = cleanString(s)
      if (c.startsWith(q)) starts.push(s)
      else if (c.includes(q)) contains.push(s)
      if (starts.length >= limit) break
    }
    return [...starts, ...contains].slice(0, limit)
  }

  return { stations, suggest }
}
```

- [ ] **Step 2: Vérification de type**

Run: `pnpm exec nuxt typecheck` (ou `pnpm dev` et vérifier l'absence d'erreur de compilation à l'import du composable plus tard)
Expected: pas d'erreur TS sur ce fichier.

- [ ] **Step 3: Commit**

```bash
git add app/composables/useStations.ts
git commit -m "feat: add useStations composable with prefix-ranked suggestions"
```

---

### Task 11: Composant `SearchBar`

**Files:**
- Create: `app/components/SearchBar.vue`
- Test: `test/SearchBar.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Create `test/SearchBar.test.ts`:
```ts
// @vitest-environment nuxt
import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import SearchBar from '~/components/SearchBar.vue'

describe('SearchBar', () => {
  it('emits "search" with origin and date when both are filled', async () => {
    const wrapper = await mountSuspended(SearchBar, {
      props: { initialOrigin: 'Paris', initialDate: '2026-06-20' },
    })
    await wrapper.find('form').trigger('submit.prevent')
    const emitted = wrapper.emitted('search')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual([{ origin: 'Paris', date: '2026-06-20' }])
  })

  it('does not emit when origin is empty', async () => {
    const wrapper = await mountSuspended(SearchBar, {
      props: { initialOrigin: '', initialDate: '2026-06-20' },
    })
    await wrapper.find('form').trigger('submit.prevent')
    expect(wrapper.emitted('search')).toBeFalsy()
    expect(wrapper.text()).toContain('Choisissez une gare')
  })
})
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `pnpm test SearchBar`
Expected: FAIL — composant introuvable.

- [ ] **Step 3: Implémenter**

Create `app/components/SearchBar.vue`:
```vue
<script setup lang="ts">
const props = defineProps<{ initialOrigin?: string; initialDate?: string }>()
const emit = defineEmits<{ search: [{ origin: string; date: string }] }>()

const { suggest } = useStations()

const origin = ref(props.initialOrigin ?? '')
const date = ref(props.initialDate ?? '')
const error = ref('')
const showSuggestions = ref(false)
const suggestions = computed(() => suggest(origin.value))

function pick(label: string) {
  origin.value = label
  showSuggestions.value = false
}

function submit() {
  if (!origin.value.trim()) {
    error.value = 'Choisissez une gare de départ.'
    return
  }
  if (!date.value) {
    error.value = 'Choisissez une date.'
    return
  }
  error.value = ''
  emit('search', { origin: origin.value.trim(), date: date.value })
}
</script>

<template>
  <form
    class="w-full max-w-md rounded-2xl bg-white/95 p-4 shadow-xl ring-1 ring-black/5 backdrop-blur"
    @submit.prevent="submit"
  >
    <div class="relative">
      <label class="block text-xs font-semibold uppercase tracking-wide text-rail-soft">Gare de départ</label>
      <input
        v-model="origin"
        type="text"
        placeholder="Paris, Lyon, Nantes…"
        autocomplete="off"
        class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        @focus="showSuggestions = true"
        @input="showSuggestions = true"
      >
      <ul
        v-if="showSuggestions && suggestions.length"
        class="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
      >
        <li
          v-for="s in suggestions"
          :key="s"
          class="cursor-pointer px-3 py-2 hover:bg-accent/10"
          @mousedown.prevent="pick(s)"
        >
          {{ s }}
        </li>
      </ul>
    </div>

    <div class="mt-3">
      <label class="block text-xs font-semibold uppercase tracking-wide text-rail-soft">Date</label>
      <input
        v-model="date"
        type="date"
        class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      >
    </div>

    <p v-if="error" class="mt-2 text-sm text-red-600">{{ error }}</p>

    <button
      type="submit"
      class="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-white transition hover:bg-accent-strong"
    >
      Voir les destinations
    </button>
  </form>
</template>
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run: `pnpm test SearchBar`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/components/SearchBar.vue test/SearchBar.test.ts
git commit -m "feat: add SearchBar with station autocomplete and validation"
```

---

### Task 12: Composable `useSearch` (URL = source de vérité)

**Files:**
- Create: `app/composables/useSearch.ts`

- [ ] **Step 1: Implémenter**

Create `app/composables/useSearch.ts`:
```ts
import type { SearchResult } from '~~/shared/types'

export function useSearch() {
  const route = useRoute()
  const router = useRouter()

  const origin = computed(() => (route.query.origin as string) || '')
  const date = computed(() => (route.query.date as string) || '')
  const hasQuery = computed(() => Boolean(origin.value && date.value))

  const { data, pending, error, refresh } = useFetch<SearchResult>('/api/search', {
    query: { origin, date },
    immediate: hasQuery.value,
    watch: [origin, date],
  })

  /** Met à jour l'URL ; le watch relance la recherche. */
  function search(params: { origin: string; date: string }) {
    router.push({ query: { origin: params.origin, date: params.date } })
  }

  return { origin, date, hasQuery, result: data, pending, error, refresh, search }
}
```

- [ ] **Step 2: Vérification de type**

Run: `pnpm dev` puis vérifier l'absence d'erreur quand la page (Task 14) l'utilise.
Expected: pas d'erreur TS.

- [ ] **Step 3: Commit**

```bash
git add app/composables/useSearch.ts
git commit -m "feat: add useSearch composable backed by URL query state"
```

---

### Task 13: Composant `DestinationCard`

**Files:**
- Create: `app/components/DestinationCard.vue`
- Test: `test/DestinationCard.test.ts`

- [ ] **Step 1: Écrire le test qui échoue**

Create `test/DestinationCard.test.ts`:
```ts
// @vitest-environment nuxt
import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import DestinationCard from '~/components/DestinationCard.vue'
import type { Destination } from '~~/shared/types'

const DEST: Destination = {
  label: 'LYON (intramuros)',
  coords: [45.76, 4.83],
  trains: [
    { departure: '07:00', arrival: '09:00', trainNumber: '6605' },
    { departure: '09:00', arrival: '11:00', trainNumber: '6601' },
  ],
}

describe('DestinationCard', () => {
  it('renders the destination label and one chip per train', async () => {
    const wrapper = await mountSuspended(DestinationCard, { props: { destination: DEST } })
    expect(wrapper.text()).toContain('LYON (intramuros)')
    expect(wrapper.findAll('[data-test="dep-chip"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('07:00')
  })

  it('emits "show-returns" when the returns button is clicked', async () => {
    const wrapper = await mountSuspended(DestinationCard, { props: { destination: DEST } })
    await wrapper.find('[data-test="returns-btn"]').trigger('click')
    expect(wrapper.emitted('show-returns')).toBeTruthy()
    expect(wrapper.emitted('show-returns')![0]).toEqual(['LYON (intramuros)'])
  })
})
```

- [ ] **Step 2: Lancer pour vérifier l'échec**

Run: `pnpm test DestinationCard`
Expected: FAIL — composant introuvable.

- [ ] **Step 3: Implémenter**

Create `app/components/DestinationCard.vue`:
```vue
<script setup lang="ts">
import type { Destination } from '~~/shared/types'

const props = defineProps<{ destination: Destination }>()
const emit = defineEmits<{ 'show-returns': [string]; hover: [string | null] }>()
</script>

<template>
  <li
    class="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-accent hover:shadow-md"
    @mouseenter="emit('hover', props.destination.label)"
    @mouseleave="emit('hover', null)"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="font-semibold text-rail">{{ props.destination.label }}</span>
      <button
        data-test="returns-btn"
        type="button"
        class="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-accent-strong hover:bg-accent/10"
        @click="emit('show-returns', props.destination.label)"
      >
        Retours →
      </button>
    </div>
    <div class="mt-2 flex flex-wrap gap-1.5">
      <span
        v-for="t in props.destination.trains"
        :key="t.departure + t.trainNumber"
        data-test="dep-chip"
        :title="`Arrivée ${t.arrival}${t.trainNumber ? ` · Train ${t.trainNumber}` : ''}`"
        class="rounded-md bg-slate-100 px-2 py-0.5 text-sm tabular-nums text-rail-soft"
      >
        {{ t.departure }}
      </span>
    </div>
  </li>
</template>
```

- [ ] **Step 4: Lancer pour vérifier le succès**

Run: `pnpm test DestinationCard`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/components/DestinationCard.vue test/DestinationCard.test.ts
git commit -m "feat: add DestinationCard with departure chips and returns trigger"
```

---

### Task 14: `ResultsRail` + page index câblée (sans carte)

**Files:**
- Create: `app/components/ResultsRail.vue`
- Modify: `app/pages/index.vue`

- [ ] **Step 1: ResultsRail**

Create `app/components/ResultsRail.vue`:
```vue
<script setup lang="ts">
import type { SearchResult } from '~~/shared/types'

defineProps<{
  result: SearchResult | null
  pending: boolean
  error: unknown
}>()
const emit = defineEmits<{
  'show-returns': [string]
  hover: [string | null]
  retry: []
}>()
</script>

<template>
  <div class="flex h-full flex-col">
    <div v-if="pending" class="p-4 text-rail-soft">Recherche des destinations…</div>

    <div v-else-if="error" class="p-4">
      <p class="text-red-600">Impossible de récupérer les données SNCF.</p>
      <button class="mt-2 rounded-md bg-rail px-3 py-1.5 text-sm text-white" @click="emit('retry')">
        Réessayer
      </button>
    </div>

    <template v-else-if="result">
      <header class="px-1 pb-2 text-sm text-rail-soft">
        <strong class="text-rail">{{ result.origin.label }}</strong> ·
        {{ result.destinations.length }} destination(s)
      </header>
      <ul v-if="result.destinations.length" class="flex flex-col gap-2 overflow-auto pr-1">
        <DestinationCard
          v-for="d in result.destinations"
          :key="d.label"
          :destination="d"
          @show-returns="emit('show-returns', $event)"
          @hover="emit('hover', $event)"
        />
      </ul>
      <p v-else class="p-4 text-rail-soft">Aucune destination TGVmax réservable ce jour-là.</p>
    </template>

    <div v-else class="p-4 text-rail-soft">
      Choisissez une gare et une date pour voir les destinations TGVmax disponibles.
    </div>
  </div>
</template>
```

- [ ] **Step 2: Page index (layout map-first, carte ajoutée en Task 15)**

Replace `app/pages/index.vue`:
```vue
<script setup lang="ts">
const { origin, date, result, pending, error, search, refresh } = useSearch()
const hovered = ref<string | null>(null)
</script>

<template>
  <main class="relative h-screen w-screen overflow-hidden bg-slate-100">
    <!-- Fond carte (placeholder jusqu'à Task 15) -->
    <div class="absolute inset-0 grid place-items-center text-slate-400">Carte</div>

    <!-- Panneau flottant gauche -->
    <div class="absolute left-4 top-4 bottom-4 z-10 flex w-[22rem] max-w-[90vw] flex-col gap-3">
      <SearchBar :initial-origin="origin" :initial-date="date" @search="search" />
      <div class="min-h-0 flex-1 rounded-2xl bg-white/95 p-3 shadow-xl ring-1 ring-black/5 backdrop-blur">
        <ResultsRail
          :result="result"
          :pending="pending"
          :error="error"
          @show-returns="() => {}"
          @hover="hovered = $event"
          @retry="refresh"
        />
      </div>
    </div>
  </main>
</template>
```

- [ ] **Step 3: Vérifier de bout en bout**

Run: `pnpm dev`, ouvrir `http://localhost:3000`, saisir « Paris » (autocomplétion), choisir une date ~10 jours plus tard, valider.
Expected: l'URL passe à `?origin=...&date=...`, le rail liste des destinations avec chips d'horaires. Recharger la page : la recherche se relance depuis l'URL.

- [ ] **Step 4: Commit**

```bash
git add app/components/ResultsRail.vue app/pages/index.vue
git commit -m "feat: wire search bar and results rail on a map-first page shell"
```

---

## Phase 3 — Carte MapLibre

### Task 15: `MapView` + synchro survol rail ↔ carte

**Files:**
- Create: `app/components/MapView.client.vue`
- Modify: `app/pages/index.vue`

- [ ] **Step 1: Composant carte (client-only via suffixe `.client`)**

Create `app/components/MapView.client.vue`:
```vue
<script setup lang="ts">
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { SearchResult } from '~~/shared/types'

const props = defineProps<{ result: SearchResult | null; hovered: string | null }>()

const container = ref<HTMLDivElement | null>(null)
let map: maplibregl.Map | null = null
const markers = new Map<string, maplibregl.Marker>()

const STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json'

onMounted(() => {
  if (!container.value) return
  map = new maplibregl.Map({
    container: container.value,
    style: STYLE,
    center: [2.4, 46.5],
    zoom: 5,
    attributionControl: { compact: true },
  })
})

onBeforeUnmount(() => {
  map?.remove()
  map = null
})

function clearMarkers() {
  markers.forEach((m) => m.remove())
  markers.clear()
}

/** Redessine markers + lignes origine→destinations. */
function render(result: SearchResult | null) {
  if (!map) return
  clearMarkers()
  if (!result) return

  const o = result.origin.coords
  if (o) {
    markers.set(
      '__origin__',
      new maplibregl.Marker({ color: '#0a2540' }).setLngLat([o[1], o[0]]).addTo(map),
    )
  }

  const lineFeatures: GeoJSON.Feature[] = []
  for (const d of result.destinations) {
    if (!d.coords) continue
    const el = document.createElement('div')
    el.className = 'tq-marker'
    el.dataset.label = d.label
    const marker = new maplibregl.Marker({ element: el, color: '#00b8a9' })
      .setLngLat([d.coords[1], d.coords[0]])
      .setPopup(new maplibregl.Popup({ offset: 16 }).setText(d.label))
      .addTo(map)
    markers.set(d.label, marker)
    if (o) {
      lineFeatures.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'LineString', coordinates: [[o[1], o[0]], [d.coords[1], d.coords[0]]] },
      })
    }
  }

  const data: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: lineFeatures }
  const src = map.getSource('lines') as maplibregl.GeoJSONSource | undefined
  if (src) {
    src.setData(data)
  } else {
    map.addSource('lines', { type: 'geojson', data })
    map.addLayer({
      id: 'lines',
      type: 'line',
      source: 'lines',
      paint: { 'line-color': '#00b8a9', 'line-width': 1.5, 'line-opacity': 0.5 },
    })
  }

  // Cadrage sur l'ensemble des points
  const pts = [o, ...result.destinations.map((d) => d.coords)].filter(Boolean) as [number, number][]
  if (pts.length) {
    const b = new maplibregl.LngLatBounds()
    pts.forEach((p) => b.extend([p[1], p[0]]))
    map.fitBounds(b, { padding: { top: 60, bottom: 60, left: 380, right: 60 }, maxZoom: 8 })
  }
}

watch(() => props.result, (r) => {
  if (map?.loaded()) render(r)
  else map?.once('load', () => render(r))
}, { immediate: false })

watch(() => props.hovered, (label) => {
  markers.forEach((m, key) => {
    const el = m.getElement()
    el.classList.toggle('tq-marker--active', key === label)
  })
  if (label) markers.get(label)?.togglePopup?.()
})
</script>

<template>
  <div ref="container" class="h-full w-full" />
</template>

<style>
.tq-marker--active { filter: drop-shadow(0 0 6px #00b8a9); }
</style>
```

- [ ] **Step 2: Brancher la carte dans la page**

In `app/pages/index.vue`, replace the placeholder map `<div>` :
```vue
    <!-- Fond carte -->
    <ClientOnly>
      <MapView class="absolute inset-0" :result="result" :hovered="hovered" />
    </ClientOnly>
```

- [ ] **Step 3: Vérifier visuellement**

Run: `pnpm dev`, refaire une recherche Paris.
Expected: la carte se centre sur la France, un marker bleu (origine) + markers turquoise (destinations) reliés par des lignes ; survoler une carte du rail met en évidence le marker correspondant.

- [ ] **Step 4: Commit**

```bash
git add app/components/MapView.client.vue app/pages/index.vue
git commit -m "feat: render destinations on a MapLibre map synced with the rail"
```

---

## Phase 4 — Dates de retour

### Task 16: `useReturns` + `ReturnDates` + intégration

**Files:**
- Create: `app/composables/useReturns.ts`
- Create: `app/components/ReturnDates.vue`
- Modify: `app/components/DestinationCard.vue`
- Modify: `app/components/ResultsRail.vue`

- [ ] **Step 1: Composable de retours (à la demande)**

Create `app/composables/useReturns.ts`:
```ts
import type { ReturnDatesResult } from '~~/shared/types'

export function useReturns() {
  const cache = reactive<Record<string, ReturnDatesResult>>({})
  const loading = ref<string | null>(null)

  async function load(originOfReturn: string, destOfReturn: string, from: string) {
    const key = `${originOfReturn}|${destOfReturn}|${from}`
    if (cache[key]) return cache[key]
    loading.value = originOfReturn
    try {
      const res = await $fetch<ReturnDatesResult>('/api/returns', {
        query: { origin: originOfReturn, dest: destOfReturn, from },
      })
      cache[key] = res
      return res
    } finally {
      loading.value = null
    }
  }

  return { cache, loading, load }
}
```

- [ ] **Step 2: Composant d'affichage des dates**

Create `app/components/ReturnDates.vue`:
```vue
<script setup lang="ts">
defineProps<{ dates: string[] }>()

function fr(iso: string): string {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}
</script>

<template>
  <div class="mt-2 border-t border-slate-100 pt-2">
    <p v-if="!dates.length" class="text-sm text-rail-soft">Aucun retour TGVmax disponible.</p>
    <div v-else class="flex flex-wrap gap-1.5">
      <span
        v-for="d in dates"
        :key="d"
        class="rounded-md bg-accent/10 px-2 py-0.5 text-sm text-accent-strong"
      >
        {{ fr(d) }}
      </span>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Afficher les retours dans la carte destination**

In `app/components/DestinationCard.vue`, add a prop and a slot zone. Replace the `<script setup>` props/emits block:
```ts
import type { Destination, ReturnDatesResult } from '~~/shared/types'

const props = defineProps<{
  destination: Destination
  returns?: ReturnDatesResult | null
  returnsLoading?: boolean
}>()
const emit = defineEmits<{ 'show-returns': [string]; hover: [string | null] }>()
```
Then, before the closing `</li>`, add:
```vue
    <p v-if="props.returnsLoading" class="mt-2 text-sm text-rail-soft">Chargement des retours…</p>
    <ReturnDates v-else-if="props.returns" :dates="props.returns.dates" />
```

- [ ] **Step 4: Câbler dans ResultsRail**

In `app/components/ResultsRail.vue`, add to props:
```ts
import type { SearchResult, ReturnDatesResult } from '~~/shared/types'

const props = defineProps<{
  result: SearchResult | null
  pending: boolean
  error: unknown
  returns: Record<string, ReturnDatesResult>
  returnsLoading: string | null
}>()
```
Update the `<DestinationCard>` usage to pass returns (key = destination label de l'aller) :
```vue
        <DestinationCard
          v-for="d in result.destinations"
          :key="d.label"
          :destination="d"
          :returns="props.returns[d.label] ?? null"
          :returns-loading="props.returnsLoading === d.label ? true : false"
          @show-returns="emit('show-returns', $event)"
          @hover="emit('hover', $event)"
        />
```

- [ ] **Step 5: Brancher dans la page**

In `app/pages/index.vue` `<script setup>`, add:
```ts
const { cache: returnsCache, loading: returnsLoading, load: loadReturns } = useReturns()

async function onShowReturns(destLabel: string) {
  if (!result.value) return
  // origine du retour = destination de l'aller ; destination du retour = origine de l'aller
  await loadReturns(destLabel, result.value.origin.label, result.value.date)
}
```
Build a label→result map for the rail:
```ts
const returnsByDest = computed(() => {
  const map: Record<string, import('~~/shared/types').ReturnDatesResult> = {}
  for (const r of Object.values(returnsCache)) map[r.origin] = r
  return map
})
```
Update `<ResultsRail>` props/handlers:
```vue
        <ResultsRail
          :result="result"
          :pending="pending"
          :error="error"
          :returns="returnsByDest"
          :returns-loading="returnsLoading"
          @show-returns="onShowReturns"
          @hover="hovered = $event"
          @retry="refresh"
        />
```

- [ ] **Step 6: Vérifier de bout en bout**

Run: `pnpm dev`, recherche Paris, cliquer « Retours → » sur une destination.
Expected: un état « Chargement… » puis une liste de dates de retour (ou « Aucun retour TGVmax disponible »).

- [ ] **Step 7: Lancer toute la suite de tests**

Run: `pnpm test`
Expected: tous les tests passent.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add on-demand return dates per destination"
```

---

## Phase 5 — Finitions

### Task 17: États (vide / erreur / chargement) & accessibilité de la recherche

**Files:**
- Modify: `app/components/SearchBar.vue`
- Modify: `app/pages/index.vue`

- [ ] **Step 1: Fermer les suggestions au clic extérieur + clavier**

In `app/components/SearchBar.vue`, add after the refs:
```ts
function onBlur() {
  // léger délai pour laisser le mousedown sélectionner une suggestion
  setTimeout(() => (showSuggestions.value = false), 120)
}
```
Add `@blur="onBlur"` and `:aria-expanded="showSuggestions"` `role="combobox"` to the origin `<input>`, and `role="listbox"` to the `<ul>` of suggestions, `role="option"` to each `<li>`.

- [ ] **Step 2: Borne la date au futur (>= aujourd'hui)**

In `app/components/SearchBar.vue` add:
```ts
const today = new Date().toISOString().slice(0, 10)
```
Add `:min="today"` to the date `<input>`.

- [ ] **Step 3: Bandeau « gratuit, sans compte »**

In `app/pages/index.vue`, add inside the floating panel, above `<SearchBar>`:
```vue
      <p class="rounded-full bg-rail px-3 py-1 text-center text-xs font-medium text-white/90">
        100% gratuit · sans paywall · sans compte
      </p>
```

- [ ] **Step 4: Vérifier**

Run: `pnpm dev`. Vérifier : suggestions se ferment au blur, date passée impossible, bandeau visible, navigation clavier dans le champ gare OK.
Expected: comportements conformes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: polish search UX (a11y combobox, future-only dates, free badge)"
```

---

### Task 18: Responsive, attributions & vérification finale

**Files:**
- Modify: `app/pages/index.vue`
- Modify: `app/components/MapView.client.vue` (si besoin attribution)

- [ ] **Step 1: Rendre le panneau responsive (mobile : panneau en bas)**

In `app/pages/index.vue`, adjust the floating panel classes to stack on small screens:
```vue
    <div class="absolute inset-x-2 bottom-2 z-10 flex max-h-[60vh] flex-col gap-3 sm:inset-x-auto sm:left-4 sm:top-4 sm:bottom-4 sm:max-h-none sm:w-[22rem]">
```

- [ ] **Step 2: Attribution des données dans l'UI**

In `app/pages/index.vue`, add a small footer link inside the panel (bas) :
```vue
      <p class="px-1 text-[11px] text-rail-soft/80">
        Données <a class="underline" href="https://data.sncf.com/explore/dataset/tgvmax/" target="_blank" rel="noopener">open data SNCF</a> ·
        carte © OpenStreetMap, MapLibre
      </p>
```
(L'attribution des tuiles est déjà rendue par le contrôle MapLibre `attributionControl`.)

- [ ] **Step 3: Build de production**

Run: `pnpm build`
Expected: build réussi sans erreur TS.

- [ ] **Step 4: Suite de tests complète**

Run: `pnpm test`
Expected: tous les tests passent.

- [ ] **Step 5: Vérification manuelle finale**

Run: `pnpm preview`, parcourir : recherche, carte, survol, retours, mobile (devtools responsive).
Expected: tout fonctionne, aucune erreur console bloquante.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: responsive layout, data attributions, production build verified"
```

---

## Self-Review — couverture de la spec

| Exigence spec | Tâche(s) |
|---|---|
| Nuxt 4 + TS + Tailwind v4 | Task 1, 2 |
| MapLibre GL, carte map-first | Task 15 |
| Pas de paywall / auth / tracking | Aucun code repris ; badge « gratuit » Task 17 |
| Route `/api/stations` (cache) | Task 7 |
| Route `/api/search` enrichie coords (cache) | Task 8 |
| Route `/api/returns` (cache) | Task 9 |
| Logique SNCF isolée (`server/utils/sncf.ts`) | Task 6 |
| Index coords + gares étrangères | Task 5 |
| `gares.json` (vérif troncature) | Task 4 |
| Filtre `od_happy_card === 'OUI'` | Task 6 |
| Matching libellés tolérant | Task 3, 5 |
| URL = source de vérité | Task 12 |
| Composables useStations/useSearch/useReturns | Task 10, 12, 16 |
| SearchBar autocomplétion + validation | Task 11 |
| ResultsRail / DestinationCard / ReturnDates | Task 13, 14, 16 |
| Synchro hover rail ↔ carte | Task 15 |
| Erreurs : champs manquants / réseau / vide / coords nulles | Task 11, 14, 5/15 |
| Tests unitaires + composants | Task 3, 5, 6, 11, 13 |
| Licence AGPL-3.0 + README + attributions | Task 2, 18 |

**Dépendance bloquante connue :** Task 4 — si `gares.json` est tronqué, l'enrichissement coords (Task 8) et la carte (Task 15) afficheront des destinations sans marker. Les routes recherche/retours et le rail fonctionnent indépendamment.
