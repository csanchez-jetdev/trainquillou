<script setup lang="ts">
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { SearchResult } from '~~/shared/types'

const props = defineProps<{ result: SearchResult | null | undefined; hovered: string | null }>()

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
    // Render initial result once map tiles are ready
    map.once('load', () => { if (props.result) render(props.result) })
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

function render(result: SearchResult | null | undefined) {
  if (!map || !result) {
    clearMarkers()
    return
  }

  clearMarkers()

  // Remove existing lines layer/source
  if (map.getLayer('lines')) map.removeLayer('lines')
  if (map.getSource('lines')) map.removeSource('lines')

  const o = result.origin.coords
  if (o) {
    const el = document.createElement('div')
    el.style.cssText = 'width:14px;height:14px;background:#0a2540;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)'
    markers.set('__origin__', new maplibregl.Marker({ element: el }).setLngLat([o[1], o[0]]).addTo(map))
  }

  const lineCoords: [number, number][][] = []

  for (const d of result.destinations) {
    if (!d.coords) continue
    const el = document.createElement('div')
    el.className = 'tq-dest-marker'
    el.dataset.label = d.label
    el.style.cssText = 'width:10px;height:10px;background:#00b8a9;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,.3);cursor:pointer;transition:transform .15s'
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
    map.addLayer({ id: 'lines', type: 'line', source: 'lines', paint: { 'line-color': '#00b8a9', 'line-width': 1.5, 'line-opacity': 0.45 } })
  }

  // Fit bounds around all visible points
  const pts = [o, ...result.destinations.map((d) => d.coords)].filter(Boolean) as [number, number][]
  if (pts.length > 1) {
    const b = new maplibregl.LngLatBounds()
    pts.forEach((p) => b.extend([p[1], p[0]]))
    map.fitBounds(b, { padding: { top: 60, bottom: 60, left: 400, right: 60 }, maxZoom: 8, duration: 800 })
  }
}

// Handles result changes after map is created (initial render is in onMounted)
watch(() => props.result, (r) => {
  if (!map) return
  if (map.loaded()) render(r)
  else map.once('load', () => render(r))
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
