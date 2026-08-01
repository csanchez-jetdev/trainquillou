<script setup lang="ts">
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { SearchResult, RouteResult, ReturnDatesResult } from '~~/shared/types'

const props = defineProps<{
  result: SearchResult | null | undefined
  route?: (RouteResult & { truncated?: boolean }) | null
  selectedRoute?: number
  hovered: string | null
  /** Destination whose popover is open. */
  selected?: string | null
  /** Restricts to the destinations kept by the rail filters; `null` = all of them. */
  visibleLabels?: string[] | null
  returnsLoading?: string | null
  returns?: Record<string, ReturnDatesResult>
}>()

const emit = defineEmits<{
  select: [string | null]
  'show-returns': [string]
}>()

/** Free vector tiles, no API key and no quota. OpenStreetMap data, OpenMapTiles schema. */
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'

/** The upstream style shows `name:latin` — "Brittany", "Upper France" on a French map. */
const FRENCH_LABELS = ['coalesce', ['get', 'name:fr'], ['get', 'name:latin'], ['get', 'name']]

/** Brand tints. The base map stays muted so teal lines and coral markers stand out. */
const TINTS: Array<{ id: string; prop: string; color: string }> = [
  { id: 'background', prop: 'background-color', color: '#faf9f5' },
  { id: 'water', prop: 'fill-color', color: '#d8e7ea' },
  { id: 'park', prop: 'fill-color', color: '#e9ece3' },
  { id: 'landcover_wood', prop: 'fill-color', color: '#e4e9e0' },
  { id: 'landuse_residential', prop: 'fill-color', color: '#f3f1ec' },
]

const instance = getCurrentInstance()
let map: maplibregl.Map | null = null
let sizeObserver: ResizeObserver | null = null
// Not `map.loaded()`: it returns false during a camera animation, and a `once('load')` posted
// then waits for an event that has already fired — the render was silently dropped.
let styleReady = false
const markers = new Map<string, maplibregl.Marker>()

/** Frenchifies labels and applies the brand tints to the loaded style. */
function styleBaseMap() {
  if (!map) return

  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue
    const textField = layer.layout?.['text-field']
    // Name layers only: road shields use `ref` and would be blanked by the substitution.
    if (!textField || !JSON.stringify(textField).includes('name')) continue
    try {
      map.setLayoutProperty(layer.id, 'text-field', FRENCH_LABELS)
    } catch {
      // An upstream layer changed shape: keep its original label.
    }
  }

  for (const { id, prop, color } of TINTS) {
    if (!map.getLayer(id)) continue
    try {
      map.setPaintProperty(id, prop, color)
    } catch {
      // Same: the tint is cosmetic, failing to apply it must not break the map.
    }
  }
}

const selectedDest = computed(
  () => props.result?.destinations.find((d) => d.label === props.selected) ?? null,
)

/** On-screen position of the popover, recomputed on every map move. */
const popoverPos = ref<{ x: number; y: number; below: boolean } | null>(null)
const popoverEl = ref<HTMLElement | null>(null)

/** Gap between the marker and the popover, in pixels. */
const GAP = 18

function syncPopover() {
  const dest = selectedDest.value
  if (!map || !dest?.coords) {
    popoverPos.value = null
    return
  }
  const point = map.project([dest.coords[1], dest.coords[0]])
  const container = map.getContainer()
  // The popover is 19rem wide: keep it inside the frame rather than let it spill out.
  const half = 160
  const x = Math.min(Math.max(point.x, half), Math.max(half, container.clientWidth - half))

  // Above by default, below when there is no room. Content can double the height
  // (expanded return dates), so measure it.
  const height = popoverEl.value?.offsetHeight ?? 260
  const below = point.y - height - GAP < 8

  popoverPos.value = { x, y: point.y, below }
}

/** Recenters on the selected destination when off-screen: picking from the list would
 *  otherwise open an invisible popover. */
function revealSelected() {
  const dest = selectedDest.value
  if (!map || !dest?.coords) return
  const container = map.getContainer()
  const point = map.project([dest.coords[1], dest.coords[0]])
  const margin = 60
  const outside =
    point.x < margin
    || point.y < margin
    || point.x > container.clientWidth - margin
    || point.y > container.clientHeight - margin
  if (outside) map.easeTo({ center: [dest.coords[1], dest.coords[0]], duration: 500 })
}

watch(() => props.selected, () => nextTick(revealSelected))

// Two passes: the first renders the popover, the second places it once its height is known.
watch(
  () => [props.selected, props.result, props.returns] as const,
  () => nextTick(() => {
    syncPopover()
    nextTick(syncPopover)
  }),
  { deep: true },
)

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
      // Le suivi de taille est fait ici, voir plus bas.
      trackResize: false,
    })

    /**
     * Our own container-size tracking, in place of MapLibre's. Theirs discards its first
     * notification — the one `ResizeObserver` always emits on subscribe — so as not to redo
     * the constructor's work. But when the layout moves in the same frame as map creation,
     * both sizes coalesce into that single discarded notification and the canvas stays stuck
     * at its initial size for good. Which is the case here as soon as a search lands: it
     * collapses the form, the map's row grows, and the map stopped two thirds down its row.
     */
    let lastSize = ''
    sizeObserver = new ResizeObserver(() => {
      const size = `${container.clientWidth}×${container.clientHeight}`
      if (size === lastSize) return
      lastSize = size
      map?.resize()
    })
    sizeObserver.observe(container)
    // Render initial state once map tiles are ready
    map.once('load', () => {
      styleReady = true
      styleBaseMap()
      draw()
    })
    // The popover is positioned in pixels: it has to follow the map.
    map.on('move', syncPopover)
    // A click on the background, outside any marker, closes the popover.
    map.on('click', () => emit('select', null))
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

function removeLayerSource(id: string) {
  if (!map) return
  if (map.getLayer(id)) map.removeLayer(id)
  if (map.getSource(id)) map.removeSource(id)
}

/**
 * Framing padding, in pixels. It used to be a flat 400 px on the left, from when the map ran
 * full width under the search column; that column now has its own grid column, and the margin
 * only crammed the points against the right edge. On a phone it was fatal: 400 px of padding
 * in a 393 px-wide container gives a negative usable width, and the framing pushed half the
 * markers — including the origin station — out of frame.
 *
 * Hence a capped fraction of the container: padding should air out the framing, not eat it,
 * and can never exceed what it borders.
 */
function fitPadding(): maplibregl.PaddingOptions {
  const el = map?.getContainer()
  const x = Math.min(60, Math.round((el?.clientWidth ?? 480) / 8))
  const y = Math.min(60, Math.round((el?.clientHeight ?? 480) / 8))
  return { top: y, bottom: y, left: x, right: x }
}

/** Creates a marker DOM element (coloured dot). */
function dot(color: string, size: number): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `width:${size}px;height:${size}px;background:${color};border-radius:50%;border:3px solid white;box-shadow:0 1px 5px rgba(0,0,0,.45);box-sizing:border-box`
  return el
}

/** A route takes precedence over search results. */
function draw() {
  if (!map) return
  if (props.route) renderRoute(props.route, props.selectedRoute ?? 0)
  else render(props.result)
}

function renderRoute(route: RouteResult, selected: number) {
  if (!map) return
  clearMarkers()
  removeLayerSource('lines')
  removeLayerSource('route-line')

  const a = route.from.coords
  const b = route.to.coords
  if (a) markers.set('__a__', new maplibregl.Marker({ element: dot('#0b1f3a', 18) }).setLngLat([a[1], a[0]]).addTo(map))
  if (b) markers.set('__b__', new maplibregl.Marker({ element: dot('#ff6b5e', 18) }).setLngLat([b[1], b[0]]).addTo(map))

  const it = route.itineraries[selected]
  const pts: [number, number][] = []
  if (it) {
    const nodes = [it.legs[0]?.fromCoords, ...it.legs.map((l) => l.toCoords)].filter(Boolean) as [number, number][]
    nodes.forEach((c, i) => {
      pts.push(c)
      if (i > 0 && i < nodes.length - 1) {
        const el = dot('#14b8b0', 14)
        markers.set(`__via_${i}__`, new maplibregl.Marker({ element: el }).setLngLat([c[1], c[0]]).addTo(map))
      }
    })
    if (nodes.length > 1) {
      map.addSource('route-line', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: nodes.map((c) => [c[1], c[0]]) } },
      })
      map.addLayer({ id: 'route-line', type: 'line', source: 'route-line', paint: { 'line-color': '#14b8b0', 'line-width': 3, 'line-opacity': 0.75 } })
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

function render(result: SearchResult | null | undefined) {
  if (!map || !result) {
    clearMarkers()
    removeLayerSource('lines')
    removeLayerSource('route-line')
    return
  }

  clearMarkers()
  removeLayerSource('route-line')

  if (map.getLayer('lines')) map.removeLayer('lines')
  if (map.getSource('lines')) map.removeSource('lines')

  const o = result.origin.coords
  if (o) {
    // The reference station: bigger and navy, to stand apart from the destinations.
    const el = document.createElement('div')
    el.style.cssText = 'width:18px;height:18px;background:#0b1f3a;border-radius:50%;border:3px solid white;box-shadow:0 1px 5px rgba(0,0,0,.45);box-sizing:border-box'
    el.title = result.origin.label
    markers.set('__origin__', new maplibregl.Marker({ element: el }).setLngLat([o[1], o[0]]).addTo(map))
  }

  const lineCoords: [number, number][][] = []

  const keep = props.visibleLabels ? new Set(props.visibleLabels) : null
  const shown = keep ? result.destinations.filter((d) => keep.has(d.label)) : result.destinations

  for (const d of shown) {
    if (!d.coords) continue
    // MapLibre positions the marker by writing `transform` on THIS element: animate the
    // child dot, or the marker jumps to the map origin until the next move.
    // 28px and transparent: the hit area is deliberately wider than the 14px dot.
    const el = document.createElement('div')
    el.className = 'tq-dest-marker'
    el.dataset.label = d.label
    el.style.cssText = 'width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation'
    el.setAttribute('role', 'button')
    el.setAttribute('aria-label', d.label)

    const pin = document.createElement('div')
    pin.className = 'tq-dot'
    pin.style.cssText = 'width:14px;height:14px;background:#14b8b0;border-radius:50%;border:2.5px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35);box-sizing:border-box;transition:transform .15s'
    el.appendChild(pin)

    el.addEventListener('click', (event) => {
      // Without this the click reaches the map, which closes the popover right away.
      event.stopPropagation()
      emit('select', props.selected === d.label ? null : d.label)
    })
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([d.coords[1], d.coords[0]])
      .addTo(map)
    markers.set(d.label, marker)
    if (o) lineCoords.push([[o[1], o[0]], [d.coords[1], d.coords[0]]])
  }

  if (lineCoords.length) {
    map.addSource('lines', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: lineCoords.map((coords) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords } })),
      },
    })
    map.addLayer({ id: 'lines', type: 'line', source: 'lines', paint: { 'line-color': '#14b8b0', 'line-width': 1.5, 'line-opacity': 0.5 } })
  }

  applyMarkerStyles()

  const pts = [o, ...shown.map((d) => d.coords)].filter(Boolean) as [number, number][]
  if (pts.length > 1) {
    const b = new maplibregl.LngLatBounds()
    pts.forEach((p) => b.extend([p[1], p[0]]))
    map.fitBounds(b, { padding: fitPadding(), maxZoom: 8, duration: 800 })
  }
}

// Redraw when the source changes. The initial render is wired up in onMounted.
watch([() => props.result, () => props.route, () => props.selectedRoute, () => props.visibleLabels], () => {
  if (styleReady) draw()
})

/** A marker can be hovered, selected, or both: one place decides how it looks. */
function applyMarkerStyles() {
  markers.forEach((m, key) => {
    if (key.startsWith('__')) return // origin and route markers
    const el = m.getElement()
    // The dot, not the marker element: that one belongs to MapLibre.
    const pin = el.firstElementChild as HTMLElement | null
    if (!pin) return
    const isSelected = key === props.selected
    const isHovered = key === props.hovered
    pin.style.background = isSelected ? '#ff6b5e' : '#14b8b0'
    pin.style.transform = isSelected ? 'scale(1.9)' : isHovered ? 'scale(1.6)' : ''
    el.style.zIndex = isSelected ? '11' : isHovered ? '10' : ''
  })
}

watch(() => [props.hovered, props.selected], applyMarkerStyles)
</script>

<template>
  <div class="h-full w-full">
    <!-- inline style: outranks maplibregl-map {position:relative} -->
    <div class="map-inner" style="position:absolute;inset:0;" />

    <!-- The overlay lets clicks through; only the popover catches them. -->
    <div v-if="selectedDest && popoverPos" class="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      <div
        ref="popoverEl"
        class="pointer-events-auto absolute"
        :style="{
          left: `${popoverPos.x}px`,
          top: `${popoverPos.y}px`,
          transform: popoverPos.below
            ? `translate(-50%, ${GAP}px)`
            : `translate(-50%, calc(-100% - ${GAP}px))`,
        }"
      >
        <DestinationPopover
          :destination="selectedDest"
          :mode="result!.mode"
          :origin-label="result!.origin.label"
          :origin-slug="result!.origin.slug"
          :returns-loading="returnsLoading === selectedDest.label"
          :returns="returns?.[selectedDest.label] ?? null"
          @close="emit('select', null)"
          @show-returns="emit('show-returns', $event)"
        />
      </div>
    </div>
  </div>
</template>
