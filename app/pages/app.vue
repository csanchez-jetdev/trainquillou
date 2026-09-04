<script setup lang="ts">
import type { ReturnDatesResult } from '~~/shared/types'
import { prettyLabel } from '~~/shared/stations'

const { origin, date, dateTo, mode, hasQuery, result, pending, error, search, refresh } = useSearch()
const itinerary = useItinerary()
const plannerEnabled = Boolean(useRuntimeConfig().public.planner)
const { cache: returnsCache, loading: returnsLoading, load: loadReturns } = useReturns()
const hovered = ref<string | null>(null)
const selectedRoute = ref(0)
const selectedDestination = ref<string | null>(null)
const visibleLabels = ref<string[] | null>(null)

const reopen = ref<string | null>(null)

watch(result, (r) => {
  const keep = reopen.value
  reopen.value = null
  selectedDestination.value = keep && r?.destinations.some((d) => d.label === keep) ? keep : null
})

watch(visibleLabels, (labels) => {
  if (labels && selectedDestination.value && !labels.includes(selectedDestination.value)) {
    selectedDestination.value = null
  }
})

// `immediate`: an SSR-payload result never fires a change, so a shared link goes uncounted.
watch(result, (r) => {
  if (r) track('search', { mode: r.mode, origin: r.origin.label, results: r.destinations.length })
}, { immediate: true })

watch(() => itinerary.route.value, (r) => {
  if (!r) return
  track('search', {
    mode: 'route',
    origin: r.from.label,
    destination: r.to.label,
    results: r.itineraries.length,
  })
})

const isRoute = computed(() => mode.value === 'route')

// Itinerary loading is client-only: expose it after mount to avoid a hydration mismatch.
const isMounted = ref(false)
onMounted(() => (isMounted.value = true))
const searchLoading = computed(() => isMounted.value && (isRoute.value ? itinerary.pending.value : pending.value))

watch(() => itinerary.route.value, () => { selectedRoute.value = 0 })

const detailDest = computed(
  () => (isRoute.value ? null : result.value?.destinations.find((d) => d.label === selectedDestination.value)) ?? null,
)

const returnsByDest = computed(() => {
  const map: Record<string, ReturnDatesResult> = {}
  for (const r of Object.values(returnsCache)) map[r.origin] = r
  return map
})

const isNarrow = ref(false)
const formOpen = ref(true)

const mobileView = ref<'map' | 'list'>('list')
const MOBILE_VIEWS = [
  { key: 'map', label: 'Carte', icon: 'M12 21c4-4.6 6-7.8 6-10.5a6 6 0 1 0-12 0C6 13.2 8 16.4 12 21Zm0-9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z' },
  { key: 'list', label: 'Liste', icon: 'M4 6h16M4 12h16M4 18h16' },
] as const

const sheetCollapsed = ref(false)
watch(formOpen, (open) => { if (open) sheetCollapsed.value = true })
watch(selectedDestination, (label) => { sheetCollapsed.value = Boolean(label) && formOpen.value })

function onMapBackground() {
  if (isNarrow.value && detailDest.value && !sheetCollapsed.value) sheetCollapsed.value = true
  else selectedDestination.value = null
}

function onMapPan() {
  if (isNarrow.value && detailDest.value) sheetCollapsed.value = true
}

onMounted(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && selectedDestination.value) selectedDestination.value = null
  }
  window.addEventListener('keydown', onKey)
  onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
})

onMounted(() => {
  const mq = window.matchMedia('(max-width: 767px)')
  isNarrow.value = mq.matches
  mq.addEventListener('change', (e) => (isNarrow.value = e.matches))
  mobileView.value = hasQuery.value ? 'list' : 'map'
})
// `useItinerary` is `server: false`: undefined → null at mount fires this watch on its own.
watch([result, () => itinerary.route.value], ([found, foundRoute]) => {
  if (isNarrow.value && (found || foundRoute)) formOpen.value = false
})
function onSearch(params: Parameters<typeof search>[0]) {
  search(params)
  if (!isNarrow.value) return
  formOpen.value = false
  mobileView.value = 'list'
}

const showList = computed(() => !isNarrow.value || mobileView.value === 'list')
/** Markers are buttons: a map merely covered by the list would stay in the tab order. */
const mapCovered = computed(() => isNarrow.value && showList.value)

function onSelectDestination(label: string) {
  if (isNarrow.value && mobileView.value === 'list') {
    selectedDestination.value = label
    mobileView.value = 'map'
    return
  }
  selectedDestination.value = selectedDestination.value === label ? null : label
}

function humanDay(iso: string): string {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

const summary = computed(() => {
  const station = isRoute.value ? itinerary.from.value : origin.value
  if (!station) return null
  const parts = [prettyLabel(station)]
  if (isRoute.value && itinerary.to.value) parts.push(prettyLabel(itinerary.to.value))
  const where = parts.join(' → ')
  if (!date.value) return where
  const twoDates = mode.value === 'roundtrip' || mode.value === 'range'
  const when = twoDates && dateTo.value
    ? `${humanDay(date.value)} → ${humanDay(dateTo.value)}`
    : humanDay(date.value)
  return `${where} · ${when}`
})

const collapsed = computed(() => isNarrow.value && !formOpen.value && Boolean(summary.value))

async function onShowReturns(destLabel: string) {
  if (!result.value) return
  track('returns_lookup', { destination: destLabel })
  await loadReturns(destLabel, result.value.origin.label, result.value.date)
}

function onPickReturn(destination: string, dateTo: string) {
  if (!result.value) return
  reopen.value = destination
  search({ mode: 'roundtrip', origin: result.value.origin.label, date: result.value.date, dateTo })
}

function onPickRouteDate(d: string) {
  search({
    mode: 'route',
    origin: itinerary.from.value,
    destination: itinerary.to.value,
    date: d,
    stops: itinerary.stops.value,
  })
}

const { public: { siteUrl } } = useRuntimeConfig()

useHead({
  title: 'Trainquillou — explorer les destinations TGVmax',
  meta: [{ name: 'robots', content: 'noindex, follow' }],
  link: [{ rel: 'canonical', href: `${siteUrl.replace(/\/$/, '')}/app` }],
})
</script>

<template>
  <div class="flex h-dvh flex-col bg-slate-100">
    <header class="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <NuxtLink to="/" class="flex items-center gap-2 font-display font-bold tracking-tight text-rail">
        <!-- Decorative: the name follows in the same link. -->
        <img
          src="/logo-mark.png"
          alt=""
          aria-hidden="true"
          width="32"
          height="32"
          class="h-8 w-8 object-contain"
        >
        Trainquillou
      </NuxtLink>
      <div class="flex items-center gap-4">
        <NuxtLink
          v-if="plannerEnabled"
          to="/planificateur"
          class="text-sm font-medium text-accent-strong hover:underline"
        >
          Plusieurs étapes
        </NuxtLink>
        <GithubLink class="text-rail-soft transition hover:text-rail" />
      </div>
    </header>

    <!-- Explicit `col-start-1`: without it the map and the list are auto-placed side by side. -->
    <!-- `grid-cols-1` and not the implicit column: `auto` would size it to the widest row. -->
    <div class="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[24rem_minmax(0,1fr)]">
      <!-- `relative z-10`: the station suggestions must overlay the map and the list. -->
      <div class="relative z-10 col-start-1 row-start-1 border-b border-slate-100 bg-white p-3 md:col-span-2 md:border-slate-200">
        <button
          v-if="collapsed"
          type="button"
          data-test="expand-search"
          class="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-accent"
          @click="formOpen = true"
        >
          <span class="min-w-0 flex-1 truncate text-sm font-semibold text-rail">{{ summary }}</span>
          <span class="shrink-0 text-xs font-medium text-accent-strong">Modifier</span>
        </button>

        <SearchBar
          v-show="!collapsed"
          :initial-origin="origin"
          :initial-destination="itinerary.to.value"
          :initial-date="date"
          :initial-date-to="dateTo"
          :initial-stops="itinerary.stops.value"
          :initial-mode="mode"
          :loading="searchLoading"
          @search="onSearch"
        />
      </div>

      <!-- Always mounted and sized: a map hidden with `display:none` reframes on 0 × 0. -->
      <!-- `z-0` gives a stacking context; without it MapLibre's layers paint over the list. -->
      <div
        class="relative z-0 col-start-1 row-start-2 md:col-start-2"
        :aria-hidden="mapCovered || undefined"
        :inert="mapCovered || undefined"
      >
        <MapView
          class="absolute inset-0"
          :result="isRoute ? null : result"
          :route="isRoute ? itinerary.route.value : null"
          :selected-route="selectedRoute"
          :hovered="hovered"
          :selected="selectedDestination"
          :visible-labels="visibleLabels"
          :sheet-covered="isNarrow && Boolean(detailDest) && !sheetCollapsed"
          @select="selectedDestination = $event"
          @background="onMapBackground"
          @pan="onMapPan"
        />
      </div>

      <!-- Positioned like the map: a block left in the flow paints under a positioned sibling. -->
      <aside
        class="relative z-1 col-start-1 row-start-2 flex min-h-0 flex-col md:border-r md:border-slate-200"
        :class="showList ? 'bg-white' : 'pointer-events-none justify-end'"
      >
        <div v-show="showList" class="pointer-events-auto relative min-h-0 flex-1 overflow-hidden px-3 py-2">
          <!-- The backend is reachable through the proxy only, not from Nitro. -->
          <ClientOnly>
            <RoutePanel
              v-if="isRoute"
              :route="itinerary.route.value"
              :pending="itinerary.pending.value"
              :error="itinerary.error.value"
              :selected="selectedRoute"
              @select="selectedRoute = $event"
              @retry="itinerary.refresh()"
              @pick-date="onPickRouteDate"
            />
            <ResultsRail
              v-else
              :result="result"
              :pending="pending"
              :error="error"
              :selected="selectedDestination"
              :narrow="isNarrow"
              :returns-loading="returnsLoading"
              :returns="returnsByDest"
              @select="onSelectDestination"
              @update:visible="visibleLabels = $event"
              @hover="hovered = $event"
              @retry="refresh"
              @show-returns="onShowReturns"
              @pick-return="onPickReturn"
            />
            <template #fallback>
              <LoadingCards :label="isRoute ? 'Recherche d\'itinéraires…' : 'Chargement…'" :count="3" />
            </template>
          </ClientOnly>

        </div>

        <!-- `relative`: the floating toggle and the detail sheet anchor on this strip. -->
        <div class="relative shrink-0">
          <div
            v-if="!(isNarrow && detailDest)"
            class="pointer-events-auto absolute bottom-full left-1/2 mb-3 -translate-x-1/2 md:hidden"
          >
            <div
              class="flex rounded-full border border-slate-200 bg-white/95 p-1 shadow-lg backdrop-blur-sm"
              role="group"
              aria-label="Affichage des résultats"
            >
              <button
                v-for="v in MOBILE_VIEWS"
                :key="v.key"
                type="button"
                :data-test="`view-${v.key}`"
                :aria-pressed="mobileView === v.key"
                class="flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
                :class="mobileView === v.key ? 'bg-rail text-white' : 'text-rail-soft'"
                @click="mobileView = v.key"
              >
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path :d="v.icon" />
                </svg>
                {{ v.label }}
              </button>
            </div>
          </div>

          <div
            v-if="isNarrow && detailDest"
            class="pointer-events-auto absolute inset-x-0 bottom-full z-30 md:hidden"
          >
            <DestinationDetail
              layout="drawer"
              :collapsed="sheetCollapsed"
              :destination="detailDest"
              :mode="result!.mode"
              :origin-label="result!.origin.label"
              :origin-slug="result!.origin.slug"
              :returns-loading="returnsLoading === detailDest.label"
              :returns="returnsByDest[detailDest.label] ?? null"
              @close="selectedDestination = null"
              @back="selectedDestination = null; mobileView = 'list'"
              @toggle="sheetCollapsed = !sheetCollapsed"
              @show-returns="onShowReturns"
              @pick-return="onPickReturn"
            />
          </div>

          <p class="pointer-events-auto border-t border-slate-100 bg-white/90 px-3 py-2 text-[11px] text-rail-soft/80 backdrop-blur-sm md:bg-white">
            Données <a class="underline" href="https://data.sncf.com/explore/dataset/tgvmax/" target="_blank" rel="noopener">open data SNCF</a> ·
            fond de carte <a class="underline" href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, données
            <a class="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> ·
            <NuxtLink to="/a-propos" class="underline">À propos</NuxtLink>
          </p>
        </div>
      </aside>
    </div>

  </div>
</template>
