/**
 * Construit server/assets/popularity.json : pour chaque gare TGVmax, un score de
 * notoriété touristique = nombre d'éditions linguistiques de Wikipédia de la ville
 * (proxy gratuit, sans clé ; les lieux très touristiques ont beaucoup de versions).
 *
 * Pipeline (toutes sources publiques, sans clé) :
 *   1. labels TGVmax  (facettes origine ∪ destination de l'open data SNCF)
 *   2. label → commune (référentiel gares.json, matching tolérant)
 *   3. commune → code INSEE (geo.api.gouv.fr, recherche floue officielle)
 *   4. INSEE → sitelinks (Wikidata SPARQL, jointure exacte via P374)
 *
 * Usage : node scripts/build-popularity.mjs
 * À relancer ponctuellement (les données évoluent lentement).
 */
import { readFile, writeFile } from 'node:fs/promises'

const SNCF = 'https://data.sncf.com/api/explore/v2.1/catalog/datasets/tgvmax'
const UA = 'trainquillou-build/1.0 (+https://github.com/csanchez-jetdev/trainquillou)'

function clean(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function stationLabels() {
  const labels = new Set()
  // group_by + limit=-1 renvoie l'univers complet (les facettes plafonnent à 100).
  for (const field of ['origine', 'destination']) {
    const res = await fetch(`${SNCF}/records?select=${field}&group_by=${field}&limit=-1`).then((r) => r.json())
    for (const row of res.results ?? []) {
      const v = row[field]
      if (v) labels.add(v)
    }
  }
  return [...labels]
}

/** Index commune mirroring server/utils/stations.ts lookup logic. */
function buildCommuneIndex(gares) {
  const entries = []
  const seen = new Set()
  for (const g of gares) {
    if (g.libelle) entries.push({ key: clean(g.libelle), commune: g.commune })
    if (g.commune) {
      const k = clean(g.commune)
      if (!seen.has(k)) {
        seen.add(k)
        entries.push({ key: k, commune: g.commune })
      }
    }
  }
  return entries
}

function findCommune(entries, label) {
  const key = clean(label)
  if (!key) return null
  const exact = entries.find((e) => e.key === key)
  if (exact) return exact.commune
  // Correspondance sur frontière de mot : le nom de commune/libellé doit être un
  // préfixe de mot du label (ou l'inverse). Le plus long gagne. Évite que
  // "PORT VENDRES VILLE" matche "Porte Maillot" (PARIS) via un préfixe partiel.
  let best = null
  for (const e of entries) {
    if (e.key.length < 3) continue
    if (key === e.key || key.startsWith(e.key + ' ') || e.key.startsWith(key + ' ')) {
      if (!best || e.key.length > best.key.length) best = e
    }
  }
  return best ? best.commune : null
}

async function communeToInsee(commune) {
  const url = `https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(commune)}&fields=code&limit=1&boost=population`
  try {
    const res = await fetch(url).then((r) => r.json())
    return res?.[0]?.code ?? null
  } catch {
    return null
  }
}

async function sitelinksByInsee(inseeCodes) {
  const out = new Map()
  // Lots de 80 codes pour rester sous les limites du endpoint SPARQL.
  for (let i = 0; i < inseeCodes.length; i += 80) {
    const batch = inseeCodes.slice(i, i + 80)
    const values = batch.map((c) => `"${c}"`).join(' ')
    const query = `SELECT ?insee ?sitelinks WHERE { VALUES ?insee { ${values} } ?city wdt:P374 ?insee. ?city wikibase:sitelinks ?sitelinks. }`
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json' } }).then((r) => r.json())
    for (const b of res.results?.bindings ?? []) {
      const insee = b.insee.value
      const sl = Number(b.sitelinks.value)
      // Garde le max (un code INSEE peut matcher plusieurs entités historiques).
      out.set(insee, Math.max(out.get(insee) ?? 0, sl))
    }
  }
  return out
}

const gares = JSON.parse(await readFile(new URL('../server/assets/gares.json', import.meta.url)))
const entries = buildCommuneIndex(gares)
const labels = await stationLabels()
console.log(`${labels.length} gares TGVmax`)

// label -> commune
const labelCommune = new Map()
for (const l of labels) {
  const c = findCommune(entries, l)
  if (c) labelCommune.set(l, c)
}

// commune -> INSEE (dédupliqué)
const communes = [...new Set(labelCommune.values())]
const communeInsee = new Map()
for (const c of communes) {
  const insee = await communeToInsee(c)
  if (insee) communeInsee.set(c, insee)
}
console.log(`${communeInsee.size}/${communes.length} communes résolues en code INSEE`)

// INSEE -> sitelinks
const inseeSitelinks = await sitelinksByInsee([...new Set(communeInsee.values())])

// label -> sitelinks
const popularity = {}
for (const [label, commune] of labelCommune) {
  const insee = communeInsee.get(commune)
  const sl = insee ? inseeSitelinks.get(insee) : undefined
  if (sl != null) popularity[clean(label)] = sl
}

const sorted = Object.fromEntries(Object.entries(popularity).sort((a, b) => b[1] - a[1]))
await writeFile(new URL('../server/assets/popularity.json', import.meta.url), JSON.stringify(sorted, null, 0) + '\n')
console.log(`${Object.keys(sorted).length} gares scorées -> server/assets/popularity.json`)
console.log('Top 8 :', Object.entries(sorted).slice(0, 8))
