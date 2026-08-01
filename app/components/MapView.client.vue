<script setup lang="ts">
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { SearchResult, RouteResult, ReturnDatesResult } from '~~/shared/types'

const props = defineProps<{
  result: SearchResult | null | undefined
  route?: (RouteResult & { truncated?: boolean }) | null
  selectedRoute?: number
  hovered: string | null
  /** Destination dont la fiche est ouverte. */
  selected?: string | null
  /** Restriction aux destinations retenues par les filtres du rail ; `null` = toutes. */
  visibleLabels?: string[] | null
  returnsLoading?: string | null
  returns?: Record<string, ReturnDatesResult>
}>()

const emit = defineEmits<{
  select: [string | null]
  'show-returns': [string]
}>()

/**
 * Fond de carte OpenFreeMap : vectoriel, libre, sans clé d'API ni quota, et
 * auto-hébergeable — cohérent avec un projet qui ne veut aucune dépendance à clé.
 * Données OpenStreetMap, schéma OpenMapTiles.
 */
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron'

/**
 * Libellés en français quand la tuile les porte. Le style d'origine affiche `name:latin`,
 * ce qui donnait « Brittany », « Upper France » ou « New Aquitania » sur une carte française.
 */
const FRENCH_LABELS = ['coalesce', ['get', 'name:fr'], ['get', 'name:latin'], ['get', 'name']]

/**
 * Teintes calées sur la charte : fond crème, eau bleu-vert désaturée. Le fond doit rester
 * en retrait pour que les tracés teal et les marqueurs corail se détachent.
 */
const TINTS: Array<{ id: string; prop: string; color: string }> = [
  { id: 'background', prop: 'background-color', color: '#faf9f5' },
  { id: 'water', prop: 'fill-color', color: '#d8e7ea' },
  { id: 'park', prop: 'fill-color', color: '#e9ece3' },
  { id: 'landcover_wood', prop: 'fill-color', color: '#e4e9e0' },
  { id: 'landuse_residential', prop: 'fill-color', color: '#f3f1ec' },
]

const instance = getCurrentInstance()
let map: maplibregl.Map | null = null
/**
 * Le style est chargé et les couches peuvent être ajoutées. On ne peut pas se fier à
 * `map.loaded()` : il renvoie `false` pendant une animation de caméra, et un
 * `map.once('load')` posé à ce moment-là attend un événement déjà passé — le rendu
 * était alors abandonné sans bruit.
 */
let styleReady = false
const markers = new Map<string, maplibregl.Marker>()

/** Francise les libellés et applique la teinte de la charte au style chargé. */
function styleBaseMap() {
  if (!map) return

  for (const layer of map.getStyle().layers ?? []) {
    if (layer.type !== 'symbol') continue
    const textField = layer.layout?.['text-field']
    // Uniquement les couches qui affichent un nom : les écussons de route utilisent
    // `ref` et seraient vidés par la substitution.
    if (!textField || !JSON.stringify(textField).includes('name')) continue
    try {
      map.setLayoutProperty(layer.id, 'text-field', FRENCH_LABELS)
    } catch {
      // Une couche du style amont a changé de forme : on garde son libellé d'origine.
    }
  }

  for (const { id, prop, color } of TINTS) {
    if (!map.getLayer(id)) continue
    try {
      map.setPaintProperty(id, prop, color)
    } catch {
      // Idem : la teinte est cosmétique, son échec ne doit pas casser la carte.
    }
  }
}

const selectedDest = computed(
  () => props.result?.destinations.find((d) => d.label === props.selected) ?? null,
)

/** Position à l'écran de la fiche, recalculée à chaque déplacement de la carte. */
const popoverPos = ref<{ x: number; y: number; below: boolean } | null>(null)
const popoverEl = ref<HTMLElement | null>(null)

/** Écart entre le marqueur et la fiche, en pixels. */
const GAP = 18

function syncPopover() {
  const dest = selectedDest.value
  if (!map || !dest?.coords) {
    popoverPos.value = null
    return
  }
  const point = map.project([dest.coords[1], dest.coords[0]])
  const container = map.getContainer()
  // La fiche fait 19rem : on la garde dans le cadre plutôt que de la laisser déborder.
  const half = 160
  const x = Math.min(Math.max(point.x, half), Math.max(half, container.clientWidth - half))

  // Au-dessus par défaut, en dessous s'il n'y a pas la place. La hauteur varie du simple
  // au double selon le contenu (dates de retour dépliées), donc on la mesure.
  const height = popoverEl.value?.offsetHeight ?? 260
  const below = point.y - height - GAP < 8

  popoverPos.value = { x, y: point.y, below }
}

/**
 * Recentre sur la destination choisie si elle est hors cadre. Sélectionner depuis la liste
 * ouvrirait sinon une fiche invisible ; cliquer un marqueur déjà à l'écran ne bouge rien.
 */
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

// Deux passes : la première rend la fiche, la seconde la replace une fois sa hauteur connue.
// `returns` en fait partie : déplier les dates de retour double la hauteur de la fiche.
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
      // L'attribution (OpenFreeMap, OpenMapTiles, OpenStreetMap) vient du TileJSON de
      // la source : la déclarer ici la ferait apparaître en double.
      attributionControl: { compact: true },
    })
    // Render initial state once map tiles are ready
    map.once('load', () => {
      styleReady = true
      styleBaseMap()
      draw()
    })
    // La fiche est positionnée en pixels : elle doit suivre la carte.
    map.on('move', syncPopover)
    // Un clic sur le fond, hors marqueur, referme la fiche.
    map.on('click', () => emit('select', null))
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
  el.style.cssText = `width:${size}px;height:${size}px;background:${color};border-radius:50%;border:3px solid white;box-shadow:0 1px 5px rgba(0,0,0,.45);box-sizing:border-box`
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
  if (a) markers.set('__a__', new maplibregl.Marker({ element: dot('#0b1f3a', 18) }).setLngLat([a[1], a[0]]).addTo(map))
  if (b) markers.set('__b__', new maplibregl.Marker({ element: dot('#ff6b5e', 18) }).setLngLat([b[1], b[0]]).addTo(map))

  const it = route.itineraries[selected]
  const pts: [number, number][] = []
  if (it) {
    // Suite ordonnée des nœuds : départ du 1er leg, puis arrivée de chaque leg
    const nodes = [it.legs[0]?.fromCoords, ...it.legs.map((l) => l.toCoords)].filter(Boolean) as [number, number][]
    nodes.forEach((c, i) => {
      pts.push(c)
      // Marqueur intermédiaire (ni A ni B)
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
    // La gare de référence : plus grosse et en navy, pour se distinguer des destinations.
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
    // MapLibre positionne le marqueur en écrivant `transform` sur CET élément : toute
    // animation doit viser la pastille enfant, sinon le marqueur saute à l'origine
    // de la carte jusqu'au prochain déplacement.
    //
    // L'élément fait 28 px et reste transparent : la zone de clic est volontairement
    // bien plus large que la pastille, viser 14 px au doigt étant pénible.
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
      // Sans cela, le clic remonte à la carte, qui referme aussitôt la fiche.
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

  // Fit bounds around all visible points
  const pts = [o, ...shown.map((d) => d.coords)].filter(Boolean) as [number, number][]
  if (pts.length > 1) {
    const b = new maplibregl.LngLatBounds()
    pts.forEach((p) => b.extend([p[1], p[0]]))
    map.fitBounds(b, { padding: { top: 60, bottom: 60, left: 400, right: 60 }, maxZoom: 8, duration: 800 })
  }
}

// Redessine quand la source change (résultat de recherche, itinéraire, ou itinéraire sélectionné).
// Le rendu initial est déclaré dans onMounted.
watch([() => props.result, () => props.route, () => props.selectedRoute, () => props.visibleLabels], () => {
  if (styleReady) draw()
})

/**
 * Un marqueur peut être survolé, sélectionné, ou les deux : un seul endroit décide de
 * son apparence, pour que les deux états ne se marchent pas dessus.
 */
function applyMarkerStyles() {
  markers.forEach((m, key) => {
    if (key.startsWith('__')) return // origine et marqueurs d'itinéraire
    const el = m.getElement()
    // La pastille, pas l'élément marqueur : celui-ci appartient à MapLibre.
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
    <!-- inline style: position:absolute a priorité 1000 et ne peut pas être écrasé par maplibregl-map {position:relative} -->
    <div class="map-inner" style="position:absolute;inset:0;" />

    <!-- Fiche de la destination sélectionnée, ancrée sur son marqueur.
         Le calque laisse passer les clics ; seule la fiche les capte. -->
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
