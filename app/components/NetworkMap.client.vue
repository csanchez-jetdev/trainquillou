<script setup lang="ts">
import { LngLatBounds, MapLibreMap, Popup } from 'maplibre-gl'
import type { ExpressionSpecification, GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { NetworkLink, NetworkStation } from '~~/shared/types'
import type { Point, RailCollection, RailGraph } from '~/utils/rail-path'
import { buildRailGraph, railTree, treePath } from '~/utils/rail-path'
import { MAP_STYLE, RAIL_NETWORK, styleBaseMap } from '~/utils/basemap'
import { prettyLabel } from '~~/shared/stations'

const props = defineProps<{
  stations: NetworkStation[]
  links: NetworkLink[]
  /** Pairs the data holds, of which `links` are the busiest. */
  linkCount: number
}>()

type Mode = 'links' | 'density' | 'pressure'

const mode = ref<Mode>('links')

/** Offered only once a second ingestion has left something to compare against. */
const hasPressure = computed(() => props.stations.some((station) => station.soldOut > 0))

/** `--color-q1`…`--color-q4` of `main.css`, resolved: MapLibre never reads a CSS variable. */
const RAMP = ['#53b1a8', '#2f9189', '#047972', '#00625b'] as const

const HEAT_RAMP: [number, string][] = [
  [0, 'rgba(83, 177, 168, 0)'],
  [0.2, RAMP[0]],
  [0.45, RAMP[1]],
  [0.7, RAMP[3]],
  [1, '#ff6b5e'],
]

/** Quartile bounds, so the four steps each carry a quarter of the drawn lines. */
const cuts = computed<[number, number, number]>(() => {
  const sorted = [...props.links].map((link) => link.offers).sort((a, b) => a - b)
  const at = (share: number) => sorted[Math.floor(sorted.length * share)] ?? 0
  // Strictly increasing: `step` refuses equal stops, which happens when the tail is flat.
  const low = at(0.25)
  const mid = Math.max(at(0.5), low + 1)
  return [low, mid, Math.max(at(0.75), mid + 1)]
})

const legend = computed(() => {
  const [low, mid, high] = cuts.value
  return [
    { color: RAMP[0], label: `moins de ${low}` },
    { color: RAMP[1], label: `${low} à ${mid}` },
    { color: RAMP[2], label: `${mid} à ${high}` },
    { color: RAMP[3], label: `${high} et plus` },
  ]
})

/** Paris carries an order of magnitude more: a linear scale leaves the country cold. */
function heatWeight(field: 'offers' | 'soldOut') {
  const sorted = props.stations.map((station) => station[field]).sort((a, b) => a - b)
  const at = (share: number) => sorted[Math.floor(sorted.length * share)] ?? 0
  // Strictly increasing: `interpolate` refuses equal stops, and the low end is often flat.
  const mid = Math.max(at(0.5), 1)
  const high = Math.max(at(0.9), mid + 1)
  const peak = Math.max(sorted.at(-1) ?? 0, high + 1)
  return [
    'interpolate', ['linear'], ['get', field], 0, 0, mid, 0.25, high, 0.6, peak, 1,
  ] as unknown as ExpressionSpecification
}

/** GeoJSON is [lon, lat]; the API answers [lat, lon] everywhere. */
function asPoint(coords: [number, number]): Point {
  return [coords[1], coords[0]]
}

async function linkFeatures(graph: RailGraph | null) {
  const byOrigin = new Map<string, NetworkLink[]>()
  for (const link of props.links) {
    const group = byOrigin.get(link.from)
    if (group) group.push(link)
    else byOrigin.set(link.from, [link])
  }

  const features = []
  for (const [, group] of byOrigin) {
    // Yields to the event loop: a hundred routing passes in a row would freeze the page.
    if (graph) await new Promise((resolve) => setTimeout(resolve))
    const from = asPoint(group[0]!.fromCoords)
    const tree = graph ? railTree(graph, from) : null
    for (const link of group) {
      const to = asPoint(link.toCoords)
      const tracks = graph && tree ? treePath(graph, tree, to) : null
      features.push({
        type: 'Feature' as const,
        properties: {
          offers: link.offers,
          name: `${prettyLabel(link.from)} – ${prettyLabel(link.to)}`,
        },
        geometry: { type: 'LineString' as const, coordinates: tracks ?? [from, to] },
      })
    }
  }
  return { type: 'FeatureCollection' as const, features }
}

function stationFeatures() {
  return {
    type: 'FeatureCollection' as const,
    features: props.stations.map((station) => ({
      type: 'Feature' as const,
      properties: {
        offers: station.offers,
        soldOut: station.soldOut,
        name: prettyLabel(station.label),
      },
      geometry: {
        type: 'Point' as const,
        coordinates: [station.coords[1], station.coords[0]],
      },
    })),
  }
}

const instance = getCurrentInstance()
let map: MapLibreMap | null = null
let popup: Popup | null = null

const LAYERS: Record<Mode, string[]> = {
  links: ['links', 'stations'],
  density: ['heat'],
  pressure: ['heat'],
}

function applyMode() {
  if (!map?.getLayer('heat')) return
  for (const layer of ['links', 'stations', 'heat']) {
    map.setLayoutProperty(
      layer,
      'visibility',
      LAYERS[mode.value].includes(layer) ? 'visible' : 'none',
    )
  }
  if (mode.value !== 'links') {
    map.setPaintProperty(
      'heat',
      'heatmap-weight',
      heatWeight(mode.value === 'pressure' ? 'soldOut' : 'offers'),
    )
  }
}

watch(mode, applyMode)

onMounted(async () => {
  const root = instance?.proxy?.$el as HTMLElement | undefined
  const container = root?.querySelector<HTMLElement>('.network-inner')
  if (!container) return

  map = new MapLibreMap({
    container,
    style: MAP_STYLE,
    // Framed on the stations below; these only decide what shows while the tiles load.
    center: [2.4, 46.6],
    zoom: 4.6,
    attributionControl: { compact: true },
  })

  const bounds = new LngLatBounds()
  for (const station of props.stations) bounds.extend([station.coords[1], station.coords[0]])
  if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 28, animate: false })

  // A pannable map swallows every vertical swipe on a phone; hover keeps working.
  for (const handler of [
    map.dragPan,
    map.dragRotate,
    map.scrollZoom,
    map.doubleClickZoom,
    map.touchZoomRotate,
    map.keyboard,
  ]) {
    handler.disable()
  }

  map.on('load', async () => {
    if (!map) return
    styleBaseMap(map)

    const [low, mid, high] = cuts.value
    map.addSource('links', { type: 'geojson', data: await linkFeatures(null) })
    map.addLayer({
      id: 'links',
      type: 'line',
      source: 'links',
      layout: { 'line-cap': 'round' },
      paint: {
        'line-color': [
          'step', ['get', 'offers'], RAMP[0], low, RAMP[1], mid, RAMP[2], high, RAMP[3],
        ],
        'line-width': ['interpolate', ['linear'], ['get', 'offers'], 1, 1, 950, 6],
      },
    })

    map.addSource('stations', { type: 'geojson', data: stationFeatures() })
    map.addLayer({
      id: 'heat',
      type: 'heatmap',
      source: 'stations',
      layout: { visibility: 'none' },
      paint: {
        'heatmap-weight': heatWeight('offers'),
        // Fixed radius: the map has no zoom, so a per-zoom ramp would never fire.
        'heatmap-radius': 38,
        'heatmap-intensity': 1,
        'heatmap-opacity': 0.8,
        'heatmap-color': [
          'interpolate', ['linear'], ['heatmap-density'], ...HEAT_RAMP.flat(),
        ],
      },
    })

    map.addLayer({
      id: 'stations',
      type: 'circle',
      source: 'stations',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'offers'], 1, 2, 4800, 7],
        'circle-color': '#0b1f3a',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': '#ffffff',
      },
    })

    popup = new Popup({ closeButton: false, closeOnClick: false, offset: 8 })
    for (const layer of ['links', 'stations']) {
      map.on('mousemove', layer, (event) => {
        const feature = event.features?.[0]
        if (!map || !popup || !feature) return
        map.getCanvas().style.cursor = 'crosshair'
        popup
          .setLngLat(event.lngLat)
          .setText(`${feature.properties?.name} · ${feature.properties?.offers} offres`)
          .addTo(map)
      })
      map.on('mouseleave', layer, () => {
        if (!map) return
        map.getCanvas().style.cursor = ''
        popup?.remove()
      })
    }

    applyMode()

    // Straight lines first: the network weighs 459 ko and routing it takes a few seconds.
    const network = await $fetch<RailCollection>(RAIL_NETWORK)
    const routed = await linkFeatures(buildRailGraph(network.features))
    map?.getSource<GeoJSONSource>('links')?.setData(routed)
  })
})

onBeforeUnmount(() => {
  popup?.remove()
  map?.remove()
  map = null
})

const MODES: { key: Mode; label: string }[] = [
  { key: 'links', label: 'Liaisons' },
  { key: 'density', label: 'Densité' },
  { key: 'pressure', label: 'Places parties' },
]

const shown = computed(() => MODES.filter((m) => m.key !== 'pressure' || hasPressure.value))

const hottest = computed(() =>
  [...props.stations].sort((a, b) => b.soldOut - a.soldOut).slice(0, 10),
)
</script>

<template>
  <figure class="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div
      v-if="shown.length > 1"
      class="flex flex-wrap gap-1 border-b border-slate-200 p-3"
      role="group"
      aria-label="Ce que la carte montre"
    >
      <button
        v-for="option in shown"
        :key="option.key"
        type="button"
        :aria-pressed="mode === option.key"
        class="rounded-lg px-3 py-1.5 text-xs font-medium transition"
        :class="mode === option.key
          ? 'bg-rail text-white'
          : 'bg-slate-100 text-rail-soft hover:bg-slate-200'"
        @click="mode = option.key"
      >
        {{ option.label }}
      </button>
    </div>

    <div class="network-inner h-[22rem] w-full sm:h-[30rem]" />

    <figcaption class="border-t border-slate-200 p-4">
      <template v-if="mode === 'links'">
        <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-rail-soft">
          <span class="font-medium text-rail">Offres réservables par liaison</span>
          <span v-for="step in legend" :key="step.color" class="flex items-center gap-1.5">
            <span class="h-1 w-5 rounded-full" :style="{ background: step.color }" />
            {{ step.label }}
          </span>
        </div>
        <p class="mt-2 text-xs text-rail-soft">
          Les {{ links.length }} liaisons les plus fournies sur {{ linkCount }}, chacune comptée
          dans les deux sens. Les points sont les gares, taille selon le nombre d'offres au départ.
          Chaque trait suit le tracé des voies, et rejoint la gare en ligne droite quand le réseau
          ne l'y relie pas (les gares étrangères, surtout).
        </p>

        <details class="mt-3">
          <summary class="cursor-pointer list-none text-xs font-medium text-accent-strong hover:underline">
            Voir les vingt liaisons les mieux servies
          </summary>
          <table class="mt-2 w-full text-left text-xs">
            <thead class="text-rail-soft">
              <tr>
                <th scope="col" class="py-1 pr-3 font-medium">Liaison</th>
                <th scope="col" class="py-1 text-right font-medium">Offres</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="link in links.slice(0, 20)" :key="`${link.from}|${link.to}`">
                <td class="py-1 pr-3">{{ prettyLabel(link.from) }} – {{ prettyLabel(link.to) }}</td>
                <td class="py-1 text-right tabular-nums">{{ link.offers }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </template>

      <template v-else>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-rail-soft">
          <span class="font-medium text-rail">
            {{ mode === 'pressure' ? 'Départs partis depuis le premier relevé' : 'Offres au départ' }}
          </span>
          <span class="flex items-center gap-1.5">
            faible
            <span
              class="h-2 w-24 rounded-full"
              :style="{ background: `linear-gradient(90deg, ${RAMP[0]}, ${RAMP[3]}, #ff6b5e)` }"
            />
            élevé
          </span>
        </div>
        <p v-if="mode === 'density'" class="mt-2 text-xs text-rail-soft">
          La même chose que les points, étalée : la chaleur d'un endroit vient des gares autour
          de lui autant que de la gare elle-même. Ce qui se lit ici, ce sont les creux : les
          régions d'où l'abonnement ne part quasiment pas.
        </p>
        <p v-else class="mt-2 text-xs text-rail-soft">
          Là où les places d'abonnement disparaissent le plus vite. Chaque relevé quotidien
          compare l'offre publiée à celle de la veille ; ce sont ces disparitions qui chauffent
          la carte, cumulées depuis le premier relevé.
        </p>

        <details v-if="mode === 'pressure'" class="mt-3">
          <summary class="cursor-pointer list-none text-xs font-medium text-accent-strong hover:underline">
            Voir les dix gares où il en part le plus
          </summary>
          <table class="mt-2 w-full text-left text-xs">
            <thead class="text-rail-soft">
              <tr>
                <th scope="col" class="py-1 pr-3 font-medium">Gare</th>
                <th scope="col" class="py-1 text-right font-medium">Départs partis</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="station in hottest" :key="station.label">
                <td class="py-1 pr-3">{{ prettyLabel(station.label) }}</td>
                <td class="py-1 text-right tabular-nums">{{ station.soldOut }}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </template>
    </figcaption>
  </figure>
</template>
