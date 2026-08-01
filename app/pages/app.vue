<script setup lang="ts">
import type { ReturnDatesResult } from '~~/shared/types'
import { prettyLabel } from '~~/shared/stations'

const { origin, date, dateTo, mode, hasQuery, result, pending, error, search, refresh } = useSearch()
const itinerary = useItinerary()
const { cache: returnsCache, loading: returnsLoading, load: loadReturns } = useReturns()
const hovered = ref<string | null>(null)
const selectedRoute = ref(0)
/** Destination whose popover is open on the map. */
const selectedDestination = ref<string | null>(null)
/** Labels kept by the rail filters; `null` when no filter is active. */
const visibleLabels = ref<string[] | null>(null)

// A new search invalidates the selection: the station may be gone from the results.
watch(result, () => { selectedDestination.value = null })

// Filtering out the open destination would leave its popover anchored to a marker
// that no longer exists.
watch(visibleLabels, (labels) => {
  if (labels && selectedDestination.value && !labels.includes(selectedDestination.value)) {
    selectedDestination.value = null
  }
})

// Search performed. `immediate`, so a shared link counts too: its result arrives in the SSR
// payload and never triggers a change on the client.
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

const returnsByDest = computed(() => {
  const map: Record<string, ReturnDatesResult> = {}
  for (const r of Object.values(returnsCache)) map[r.origin] = r
  return map
})

// On a narrow screen the form and the map already take the full height: the form collapses
// to a summary once a search succeeds, or the results get no room at all.
const isNarrow = ref(false)
const formOpen = ref(true)

// On a narrow screen map and list do not fit together: a map cut to a third of the height did
// not separate the Paris-area markers, and the three destinations left visible did not make a
// list. So only one shows at a time.
const mobileView = ref<'map' | 'list'>('list')
const MOBILE_VIEWS = [
  { key: 'map', label: 'Carte', icon: 'M12 21c4-4.6 6-7.8 6-10.5a6 6 0 1 0-12 0C6 13.2 8 16.4 12 21Zm0-9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z' },
  { key: 'list', label: 'Liste', icon: 'M4 6h16M4 12h16M4 18h16' },
] as const

onMounted(() => {
  const mq = window.matchMedia('(max-width: 767px)')
  isNarrow.value = mq.matches
  mq.addEventListener('change', (e) => (isNarrow.value = e.matches))
  // With no search running the list has one sentence to show, so the map makes the better
  // landing screen. With one — shared link, browser back — results are coming, so open where
  // they will appear.
  mobileView.value = hasQuery.value ? 'list' : 'map'
})
// Only collapse on a search that actually succeeded: `useItinerary` is `server: false`, so
// its result goes undefined → null at mount, which was enough to collapse an empty form.
watch([result, () => itinerary.route.value], ([found, foundRoute]) => {
  if (isNarrow.value && (found || foundRoute)) formOpen.value = false
})
function onSearch(params: Parameters<typeof search>[0]) {
  search(params)
  if (!isNarrow.value) return
  formOpen.value = false
  // To the list: it carries the loading skeleton, the error and its retry button, the count,
  // the sort and the filters. Staying on the map would leave a running search with no
  // visible feedback.
  mobileView.value = 'list'
}

/** On desktop both views coexist; on a narrow screen the toggle decides. */
const showList = computed(() => !isNarrow.value || mobileView.value === 'list')
/**
 * Map covered by the list: it stays sized but leaves the tab order and the accessibility tree,
 * otherwise its markers — which are buttons — stay reachable behind the list hiding them.
 */
const mapCovered = computed(() => isNarrow.value && showList.value)

/**
 * Opening a popover from the list, on a narrow screen, means switching to the map: that is
 * where it anchors, and a tap with no visible effect reads as a breakage. And always select,
 * never deselect — the second tap of a toggle makes no sense when the first was never seen.
 */
function onSelectDestination(label: string) {
  if (isNarrow.value && mobileView.value === 'list') {
    selectedDestination.value = label
    mobileView.value = 'map'
    return
  }
  selectedDestination.value = selectedDestination.value === label ? null : label
}

/** Summary of the current search, shown in place of the collapsed form. */
const summary = computed(() => {
  const station = isRoute.value ? itinerary.from.value : origin.value
  if (!station) return null
  const parts = [prettyLabel(station)]
  if (isRoute.value && itinerary.to.value) parts.push(prettyLabel(itinerary.to.value))
  const where = parts.join(' → ')
  if (!date.value) return where
  const [y, m, d] = date.value.split('-')
  const when = new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
  return `${where} · ${when}`
})

/** Derived, not declared: it requires a summary, which guarantees the column is never empty. */
const collapsed = computed(() => isNarrow.value && !formOpen.value && Boolean(summary.value))

async function onShowReturns(destLabel: string) {
  if (!result.value) return
  track('returns_lookup', { destination: destLabel })
  await loadReturns(destLabel, result.value.origin.label, result.value.date)
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

// `noindex, follow`: the app is one client-rendered shell behind hundreds of URL variants
// (`?origin=&date=&mode=`) — nothing to index, but outgoing links still pass their weight.
const { public: { siteUrl } } = useRuntimeConfig()

useHead({
  title: 'Trainquillou — explorer les destinations TGVmax',
  meta: [{ name: 'robots', content: 'noindex, follow' }],
  link: [{ rel: 'canonical', href: `${siteUrl.replace(/\/$/, '')}/app` }],
})
</script>

<template>
  <div class="flex h-[100dvh] flex-col bg-slate-100">
    <header class="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <NuxtLink to="/" class="flex items-center gap-2 font-bold tracking-tight text-rail">
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
      <GithubLink class="text-rail-soft transition hover:text-rail" />
    </header>

    <!--
      Three blocks, two layouts. On a narrow screen: search on top, then map and list in one
      and the same cell, stacked, the floating toggle deciding which is in front. Stacked
      rather than alternated, so the map stays sized at all times — its framing is computed
      from the container size, and hidden with `display:none` while a search lands it would
      frame on 0 × 0 and come back on a wrong view. On desktop: search as a bar above both
      columns, results left, map right.

      All three carry an explicit `col-start-1`. Without it, two items asking for the same
      row without naming a column do not stack: auto-placement creates an implicit column
      for the second, and map and list ended up side by side on half a phone screen each.

      Stacking is explicit too: map at 0, results at 1, station suggestions at 10. The map's
      `z-0` is not decorative, it gives it a stacking context — without one its own layers
      (MapLibre attribution at 2, destination popover at 20) climb into the parent context
      and paint back over the list meant to hide them.
    -->
    <div class="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[24rem_minmax(0,1fr)]">
      <!-- `relative z-10`: station suggestions must overlay the map and the list, its
           immediate neighbours. -->
      <div class="relative z-10 col-start-1 row-start-1 border-b border-slate-100 bg-white p-3 md:col-span-2 md:border-slate-200">
        <!-- Collapsed form: clickable summary, narrow screens only -->
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

      <!-- Always mounted and sized; on mobile the list comes over it. -->
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
          :returns-loading="returnsLoading"
          :returns="returnsByDest"
          @select="selectedDestination = $event"
          @show-returns="onShowReturns"
        />
      </div>

      <!--
        Same cell as the map on mobile, hence positioned too: a block left in the flow paints
        under any positioned sibling, whatever the DOM order. In map view only the attribution
        line remains, and the rest lets gestures through to the map.
      -->
      <aside
        class="relative z-[1] col-start-1 row-start-2 flex min-h-0 flex-col md:border-r md:border-slate-200"
        :class="showList ? 'bg-white' : 'pointer-events-none justify-end'"
      >
        <div v-show="showList" class="pointer-events-auto min-h-0 flex-1 overflow-hidden px-3 py-2">
          <ClientOnly v-if="isRoute">
            <RoutePanel
              :route="itinerary.route.value"
              :pending="itinerary.pending.value"
              :error="itinerary.error.value"
              :selected="selectedRoute"
              @select="selectedRoute = $event"
              @retry="itinerary.refresh()"
              @pick-date="onPickRouteDate"
            />
            <template #fallback>
              <LoadingCards label="Recherche d'itinéraires…" :count="3" />
            </template>
          </ClientOnly>
          <ResultsRail
            v-else
            :result="result"
            :pending="pending"
            :error="error"
            :selected="selectedDestination"
            @select="onSelectDestination"
            @update:visible="visibleLabels = $event"
            @hover="hovered = $event"
            @retry="refresh"
          />
        </div>

        <!-- Bottom stack: the toggle floats, the attribution stays in the flow. `relative` is
             there so the former anchors on the latter. -->
        <div class="relative shrink-0">
          <!--
            Map/list toggle, narrow screens only. Floating, so it costs no usable height — the
            very thing moving the search up was meant to win — and within thumb reach rather
            than at the top of the screen. `bottom-full` sets it just above the attribution
            instead of letting it cover it.
          -->
          <div class="pointer-events-auto absolute bottom-full left-1/2 mb-3 -translate-x-1/2 md:hidden">
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

          <!-- Visible in both views, as a translucent strip over the map when the map is in
               front: it uses the same data. -->
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
