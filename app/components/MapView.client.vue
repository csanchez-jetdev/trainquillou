<script setup lang="ts">
import maplibregl from 'maplibre-gl'
import type { LineLayerSpecification } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { SearchResult, RouteResult } from '~~/shared/types'
import type { RailCollection, RailGraph, RailTree, Point } from '~/utils/rail-path'
import { MAP_STYLE, RAIL_NETWORK, styleBaseMap } from '~/utils/basemap'
import { prettyLabel } from '~~/shared/stations'

type RailLines = {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    /** Index of the leg, which decides its colour. */
    properties: { leg: number }
    geometry: { type: 'LineString', coordinates: Point[] }
  }>
}

const props = defineProps<{
  result: SearchResult | null | undefined
  route?: (RouteResult & { truncated?: boolean }) | null
  selectedRoute?: number
  hovered: string | null
  selected?: string | null
  /** Restricts to the destinations kept by the rail filters; `null` = all of them. */
  visibleLabels?: string[] | null
  /** The mobile sheet is open at full height, hiding the lower half of the map. */
  sheetCovered?: boolean
}>()

const emit = defineEmits<{
  select: [string | null]
  background: []
  /** The map was moved by hand, never by our own `easeTo`. */
  pan: []
}>()

const RAIL_PAINT = { 'line-color': '#0b1f3a', 'line-width': 1.8, 'line-opacity': 0.45 } as const

/** One colour per leg, the same ones the itinerary list uses. */
const TRIP_PAINT: LineLayerSpecification['paint'] = {
  'line-color': ['match', ['get', 'leg'], 1, LEG_COLORS[1], 2, LEG_COLORS[2], LEG_COLORS[0]],
  'line-width': 5,
}
const TRIP_CASING = { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.95 } as const

const ROUND = { 'line-cap': 'round', 'line-join': 'round' } as const

const NO_LINES: RailLines = { type: 'FeatureCollection', features: [] }

const instance = getCurrentInstance()
let map: maplibregl.Map | null = null
let sizeObserver: ResizeObserver | null = null
// Not `map.loaded()`: it returns false during a camera animation, long after `load` fired.
let styleReady = false
// The selection watcher never fires when a result lands under an already open destination.
let keepSelectionFramed = false
const markers = new Map<string, maplibregl.Marker>()

let network: RailCollection | null = null
let graph: RailGraph | null = null
/** Shortest paths from the searched station to the whole network; `null` in route mode. */
let tree: RailTree | null = null

/** Our layers go under it, so the base map keeps its labels on top. */
function firstSymbolLayer(): string | undefined {
  return map?.getStyle().layers?.find((l) => l.type === 'symbol')?.id
}

function lines(paths: Point[][]): RailLines {
  return {
    type: 'FeatureCollection',
    features: paths.map((coordinates, leg) => ({
      type: 'Feature',
      properties: { leg },
      geometry: { type: 'LineString', coordinates },
    })),
  }
}

function setLines(id: 'rail' | 'trip', data: RailLines) {
  map?.getSource<maplibregl.GeoJSONSource>(id)?.setData(data)
}

async function addRailNetwork() {
  if (!map || map.getSource('rail')) return
  // Fetched here, not left to MapLibre as a URL: the routing needs the same geometry.
  network = await $fetch<RailCollection>(RAIL_NETWORK)
  if (!map) return
  const before = firstSymbolLayer()
  map.addSource('rail', { type: 'geojson', data: NO_LINES })
  map.addLayer({ id: 'rail', type: 'line', source: 'rail', layout: ROUND, paint: RAIL_PAINT }, before)
  // A casing under the coral, or the trip disappears into the lines it follows.
  map.addSource('trip', { type: 'geojson', data: NO_LINES })
  map.addLayer({ id: 'trip-casing', type: 'line', source: 'trip', layout: ROUND, paint: TRIP_CASING }, before)
  map.addLayer({ id: 'trip', type: 'line', source: 'trip', layout: ROUND, paint: TRIP_PAINT }, before)
  // The tracks land after the first render, and after a shared link has picked a destination.
  drawRail()
  drawTrip()
}

/** Coordinates the API gives as `[lat, lon]`, in the `[lon, lat]` order of the tracks. */
const asPoint = (coords: [number, number]): Point => [coords[1], coords[0]]

function drawRail() {
  if (!map || !network) return
  graph ??= buildRailGraph(network.features)
  const origin = props.result?.origin.coords
  tree = origin && !props.route ? railTree(graph, asPoint(origin)) : null
  if (!tree) return setLines('rail', NO_LINES)

  const paths: Point[][] = []
  for (const d of shownDestinations()) {
    if (!d.coords) continue
    const path = treePath(graph, tree, asPoint(d.coords))
    if (path) paths.push(path)
  }
  setLines('rail', lines(paths))
}

function drawTrip() {
  if (!map || !graph) return
  const itinerary = props.route?.itineraries[props.selectedRoute ?? 0]
  if (itinerary) {
    const legs: Point[][] = []
    for (const leg of itinerary.legs) {
      if (!leg.fromCoords || !leg.toCoords) continue
      legs.push(railPathThrough(graph, [asPoint(leg.fromCoords), asPoint(leg.toCoords)]))
    }
    return setLines('trip', legs.length ? lines(legs) : NO_LINES)
  }

  const origin = props.result?.origin.coords
  const dest = selectedDest.value?.coords
  if (!origin || !dest || !tree) return setLines('trip', NO_LINES)
  const path = treePath(graph, tree, asPoint(dest)) ?? [asPoint(origin), asPoint(dest)]
  setLines('trip', lines([path]))
}

const selectedDest = computed(
  () => props.result?.destinations.find((d) => d.label === props.selected) ?? null,
)

/** Share of the map height left uncovered by the mobile sheet. */
const SHEET_FREE = 0.45

function revealSelected() {
  const dest = selectedDest.value
  if (!map || !dest?.coords) return
  const container = map.getContainer()
  const point = map.project([dest.coords[1], dest.coords[0]])
  const margin = 60
  // What the sheet hides counts as off-screen; the point is aimed into the band left free.
  const floor = props.sheetCovered ? container.clientHeight * SHEET_FREE : container.clientHeight
  const outside =
    point.x < margin
    || point.y < margin
    || point.x > container.clientWidth - margin
    || point.y > floor - margin
  if (!outside) return
  map.easeTo({
    center: [dest.coords[1], dest.coords[0]],
    offset: props.sheetCovered ? [0, -container.clientHeight * (0.5 - SHEET_FREE / 2)] : [0, 0],
    duration: 500,
  })
}

watch(() => props.selected, () => {
  drawTrip()
  nextTick(revealSelected)
})

onMounted(async () => {
  await nextTick()
  const root = instance?.proxy?.$el as HTMLElement | undefined
  const container = root?.querySelector<HTMLElement>('.map-inner')
  if (!container) { console.error('[MapView] .map-inner not found', root?.outerHTML?.slice(0, 100)); return }
  try {
    map = new maplibregl.Map({
      container,
      style: MAP_STYLE,
      center: [2.4, 46.5],
      zoom: 5,
      // Attribution comes from the source TileJSON: declaring it here would duplicate it.
      attributionControl: { compact: true },
      // Replaced by our own size tracking below.
      trackResize: false,
    })

    // MapLibre's own tracking discards the first ResizeObserver notification, often the only one.
    let lastSize = ''
    sizeObserver = new ResizeObserver(() => {
      const size = `${container.clientWidth}×${container.clientHeight}`
      if (size === lastSize) return
      lastSize = size
      map?.resize()
    })
    sizeObserver.observe(container)
    map.once('load', () => {
      if (!map) return
      styleReady = true
      styleBaseMap(map)
      draw()
      // Not awaited: the map is usable before the tracks land.
      void addRailNetwork()
    })
    // Markers stop propagation, so this only ever fires outside them.
    map.on('click', () => emit('background'))
    // `originalEvent` tells a hand zoom from our own `easeTo`, which must not read as a pan.
    map.on('dragstart', () => emit('pan'))
    map.on('zoomstart', (e) => { if (e.originalEvent) emit('pan') })
  } catch (e) {
    console.error('[MapView] maplibre init failed:', e)
  }
})

onBeforeUnmount(() => {
  sizeObserver?.disconnect()
  sizeObserver = null
  map?.remove()
  map = null
})

function clearMarkers() {
  markers.forEach((m) => m.remove())
  markers.clear()
}

/** A flat padding exceeds the width of a phone, leaving a negative usable width. */
function fitPadding(): maplibregl.PaddingOptions {
  const el = map?.getContainer()
  const x = Math.min(60, Math.round((el?.clientWidth ?? 480) / 8))
  const y = Math.min(60, Math.round((el?.clientHeight ?? 480) / 8))
  // What the sheet hides is not framing space; the eighth-height cap keeps the band usable.
  const hidden = props.sheetCovered ? Math.round((el?.clientHeight ?? 480) * (1 - SHEET_FREE)) : 0
  return { top: y, bottom: y + hidden, left: x, right: x }
}

function dot(color: string, size: number): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `width:${size}px;height:${size}px;background:${color};border-radius:50%;border:3px solid white;box-shadow:0 1px 5px rgba(0,0,0,.45);box-sizing:border-box`
  return el
}

function draw() {
  if (!map) return
  if (props.route) renderRoute(props.route, props.selectedRoute ?? 0)
  else render(props.result)
  drawRail()
  drawTrip()
}

function renderRoute(route: RouteResult, selected: number) {
  if (!map) return
  clearMarkers()

  const a = route.from.coords
  const b = route.to.coords
  if (a) markers.set('__a__', new maplibregl.Marker({ element: dot('#0b1f3a', 18) }).setLngLat([a[1], a[0]]).addTo(map))
  if (b) markers.set('__b__', new maplibregl.Marker({ element: dot('#ff6b5e', 18) }).setLngLat([b[1], b[0]]).addTo(map))

  const it = route.itineraries[selected]
  const pts: [number, number][] = []
  if (it) {
    const nodes = [it.legs[0]?.fromCoords, ...it.legs.map((l) => l.toCoords)].filter(Boolean) as [number, number][]
    // Not `forEach`: inside a callback TypeScript widens `map` back to nullable.
    for (const [i, c] of nodes.entries()) {
      pts.push(c)
      if (i > 0 && i < nodes.length - 1) {
        const el = dot('#14b8b0', 14)
        markers.set(`__via_${i}__`, new maplibregl.Marker({ element: el }).setLngLat([c[1], c[0]]).addTo(map))
      }
    }
  } else {
    if (a) pts.push(a)
    if (b) pts.push(b)
  }

  if (pts.length > 1) {
    const bounds = new maplibregl.LngLatBounds()
    pts.forEach((p) => bounds.extend([p[1], p[0]]))
    map.fitBounds(bounds, { padding: fitPadding(), maxZoom: 8, duration: 800 })
  }
}

function shownDestinations() {
  const all = props.result?.destinations ?? []
  const keep = props.visibleLabels ? new Set(props.visibleLabels) : null
  return keep ? all.filter((d) => keep.has(d.label)) : all
}

function render(result: SearchResult | null | undefined) {
  if (!map || !result) {
    clearMarkers()
    return
  }

  clearMarkers()

  const o = result.origin.coords
  if (o) {
    const el = document.createElement('div')
    el.style.cssText = 'width:18px;height:18px;background:#0b1f3a;border-radius:50%;border:3px solid white;box-shadow:0 1px 5px rgba(0,0,0,.45);box-sizing:border-box'
    el.title = result.origin.label
    markers.set('__origin__', new maplibregl.Marker({ element: el }).setLngLat([o[1], o[0]]).addTo(map))
  }

  const shown = shownDestinations()

  for (const d of shown) {
    if (!d.coords) continue
    // MapLibre writes `transform` on this element: animate the child dot, never this one.
    const el = document.createElement('div')
    el.className = 'tq-dest-marker'
    el.dataset.label = d.label
    el.style.cssText = 'width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation'
    el.title = prettyLabel(d.label)

    // Size carries the band too: colour alone excludes anyone who cannot separate the hues.
    const best = fastestTrip(d.trains ?? [])
    const band = durationBand(best ? tripDurationMin(best) : null)
    const size = band ? 12 + DURATION_BANDS.indexOf(band) * 2 : 12
    const pin = document.createElement('div')
    pin.className = 'tq-dot'
    pin.dataset.band = band?.token ?? ''
    pin.style.cssText = `width:${size}px;height:${size}px;background:var(--color-${band?.token ?? 'accent'});border-radius:50%;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35);box-sizing:border-box;transition:transform .15s`
    el.appendChild(pin)

    el.addEventListener('click', (event) => {
      // Without this the click reaches the map, which closes the detail right away.
      event.stopPropagation()
      emit('select', props.selected === d.label ? null : d.label)
    })
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([d.coords[1], d.coords[0]])
      .addTo(map)
    markers.set(d.label, marker)
  }

  applyMarkerStyles()

  // The city shown in the sheet has to stay in frame.
  const focus = keepSelectionFramed ? selectedDest.value?.coords : null
  const pts = (focus ? [o, focus] : [o, ...shown.map((d) => d.coords)]).filter(Boolean) as [number, number][]
  if (pts.length > 1) {
    const b = new maplibregl.LngLatBounds()
    pts.forEach((p) => b.extend([p[1], p[0]]))
    map.fitBounds(b, { padding: fitPadding(), maxZoom: 8, duration: 800 })
  }
}

// No `immediate`: the first render is wired in `onMounted`.
watch([() => props.result, () => props.route, () => props.selectedRoute, () => props.visibleLabels], ([result], [previous]) => {
  if (!styleReady) return
  keepSelectionFramed = result !== previous
  draw()
  keepSelectionFramed = false
})

function applyMarkerStyles() {
  markers.forEach((m, key) => {
    if (key.startsWith('__')) return // origin and route markers
    const el = m.getElement()
    // The dot, not the marker element: that one belongs to MapLibre.
    const pin = el.firstElementChild as HTMLElement | null
    if (!pin) return
    const isSelected = key === props.selected
    const isHovered = key === props.hovered
    pin.style.background = isSelected ? 'var(--color-coral)' : `var(--color-${pin.dataset.band || 'accent'})`
    pin.style.transform = isSelected ? 'scale(1.9)' : isHovered ? 'scale(1.6)' : ''
    el.style.zIndex = isSelected ? '11' : isHovered ? '10' : ''
  })
}

watch(() => [props.hovered, props.selected], applyMarkerStyles)
</script>

<template>
  <div class="h-full w-full">
    <!-- `aria-hidden`: the list carries the same destinations as real buttons. -->
    <!-- inline style: outranks maplibregl-map {position:relative} -->
    <div class="map-inner" aria-hidden="true" style="position:absolute;inset:0;" />

    <!-- Top on a narrow screen: the page's attribution strip covers the bottom of the map. -->
    <ul
      v-if="result && result.mode !== 'range' && !route"
      class="absolute left-2 top-2 z-10 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white/90 px-2 py-1.5 backdrop-blur-sm md:bottom-2 md:top-auto"
    >
      <li class="text-[10px] font-semibold uppercase tracking-wide text-rail-soft">Trajet</li>
      <li
        v-for="b in DURATION_BANDS"
        :key="b.token"
        class="flex items-center gap-1.5 text-[11px] leading-none text-rail-soft"
      >
        <span class="h-2 w-2 shrink-0 rounded-full" :style="{ background: `var(--color-${b.token})` }" />
        {{ b.short }}
      </li>
      <li class="mt-0.5 flex items-center gap-1.5 border-t border-slate-100 pt-1.5 text-[11px] leading-none text-rail-soft">
        <span class="h-[2px] w-2.5 shrink-0 bg-rail/50" />
        lignes desservies
      </li>
      <li class="flex items-center gap-1.5 text-[11px] leading-none text-rail-soft">
        <span class="h-[3px] w-2.5 shrink-0 rounded-full bg-coral" />
        trajet choisi
      </li>
    </ul>
  </div>
</template>
