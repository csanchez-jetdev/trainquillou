<script setup lang="ts">
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { SearchResult, RouteResult } from '~~/shared/types'

const props = defineProps<{
  result: SearchResult | null | undefined
  route?: (RouteResult & { truncated?: boolean }) | null
  selectedRoute?: number
  hovered: string | null
}>()

const instance = getCurrentInstance()
let map: maplibregl.Map | null = null
const markers = new Map<string, maplibregl.Marker>()

onMounted(async () => {
  await nextTick()
  const root = instance?.proxy?.$el as HTMLElement | undefined
  const container = root?.querySelector<HTMLElement>('.map-inner')
  if (!container) { console.error('[MapView] .map-inner not found', root?.outerHTML?.slice(0, 100)); return }
  try {
    map = new maplibregl.Map({
      container,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: [2.4, 46.5],
      zoom: 5,
      attributionControl: { compact: true },
    })
    // Render initial state once map tiles are ready
    map.once('load', () => draw())
  } catch (e) {
    console.error('[MapView] maplibre init failed:', e)
  }
})

onBeforeUnmount(() => {
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

/** Crée un élément DOM de marqueur (pastille colorée). */
function dot(color: string, size: number): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `width:${size}px;height:${size}px;background:${color};border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)`
  return el
}

/** Aiguille le rendu selon la source active : itinéraire prioritaire, sinon recherche. */
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
  if (a) markers.set('__a__', new maplibregl.Marker({ element: dot('#0b1f3a', 14) }).setLngLat([a[1], a[0]]).addTo(map))
  if (b) markers.set('__b__', new maplibregl.Marker({ element: dot('#ff6b5e', 14) }).setLngLat([b[1], b[0]]).addTo(map))

  const it = route.itineraries[selected]
  const pts: [number, number][] = []
  if (it) {
    // Suite ordonnée des nœuds : départ du 1er leg, puis arrivée de chaque leg
    const nodes = [it.legs[0]?.fromCoords, ...it.legs.map((l) => l.toCoords)].filter(Boolean) as [number, number][]
    nodes.forEach((c, i) => {
      pts.push(c)
      // Marqueur intermédiaire (ni A ni B)
      if (i > 0 && i < nodes.length - 1) {
        const el = dot('#14b8b0', 11)
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
    map.fitBounds(bounds, { padding: { top: 60, bottom: 60, left: 400, right: 60 }, maxZoom: 8, duration: 800 })
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

  // Remove existing lines layer/source
  if (map.getLayer('lines')) map.removeLayer('lines')
  if (map.getSource('lines')) map.removeSource('lines')

  const o = result.origin.coords
  if (o) {
    const el = document.createElement('div')
    el.style.cssText = 'width:14px;height:14px;background:#0b1f3a;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)'
    markers.set('__origin__', new maplibregl.Marker({ element: el }).setLngLat([o[1], o[0]]).addTo(map))
  }

  const lineCoords: [number, number][][] = []

  for (const d of result.destinations) {
    if (!d.coords) continue
    const el = document.createElement('div')
    el.className = 'tq-dest-marker'
    el.dataset.label = d.label
    el.style.cssText = 'width:10px;height:10px;background:#14b8b0;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:pointer;transition:transform .15s'
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([d.coords[1], d.coords[0]])
      .setPopup(new maplibregl.Popup({ offset: 12 }).setText(d.label))
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

  // Fit bounds around all visible points
  const pts = [o, ...result.destinations.map((d) => d.coords)].filter(Boolean) as [number, number][]
  if (pts.length > 1) {
    const b = new maplibregl.LngLatBounds()
    pts.forEach((p) => b.extend([p[1], p[0]]))
    map.fitBounds(b, { padding: { top: 60, bottom: 60, left: 400, right: 60 }, maxZoom: 8, duration: 800 })
  }
}

// Redessine quand la source change (résultat de recherche, itinéraire, ou itinéraire sélectionné).
// Le rendu initial est déclaré dans onMounted.
watch([() => props.result, () => props.route, () => props.selectedRoute], () => {
  if (!map) return
  if (map.loaded()) draw()
  else map.once('load', () => draw())
})

watch(() => props.hovered, (label) => {
  markers.forEach((m, key) => {
    if (key === '__origin__') return
    const el = m.getElement()
    if (key === label) {
      el.style.transform = 'scale(1.6)'
      el.style.zIndex = '10'
    } else {
      el.style.transform = ''
      el.style.zIndex = ''
    }
  })
})
</script>

<template>
  <div class="h-full w-full">
    <!-- inline style: position:absolute a priorité 1000 et ne peut pas être écrasé par maplibregl-map {position:relative} -->
    <div class="map-inner" style="position:absolute;inset:0;" />
  </div>
</template>
