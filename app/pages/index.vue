<script setup lang="ts">
import type { ReturnDatesResult } from '~~/shared/types'

const { origin, date, dateTo, mode, result, pending, error, search, refresh } = useSearch()
const itinerary = useItinerary()
const { cache: returnsCache, loading: returnsLoading, load: loadReturns } = useReturns()
const hovered = ref<string | null>(null)
const selectedRoute = ref(0)

const isRoute = computed(() => mode.value === 'route')

// Réinitialise la sélection quand un nouvel itinéraire arrive.
watch(() => itinerary.route.value, () => { selectedRoute.value = 0 })

const returnsByDest = computed(() => {
  const map: Record<string, ReturnDatesResult> = {}
  for (const r of Object.values(returnsCache)) map[r.origin] = r
  return map
})

async function onShowReturns(destLabel: string) {
  if (!result.value) return
  await loadReturns(destLabel, result.value.origin.label, result.value.date)
}
</script>

<template>
  <main class="relative h-screen w-screen overflow-hidden bg-slate-100">
    <!-- Carte en fond (.client.vue = client-only) : source = itinéraire en mode route, sinon recherche -->
    <MapView
      class="absolute inset-0"
      :result="isRoute ? null : result"
      :route="isRoute ? itinerary.route.value : null"
      :selected-route="selectedRoute"
      :hovered="hovered"
    />

    <!-- Panneau flottant gauche -->
    <div class="absolute inset-x-2 bottom-2 z-10 flex max-h-[70vh] flex-col gap-3 sm:inset-x-auto sm:left-4 sm:top-4 sm:bottom-4 sm:max-h-none sm:w-[22rem]">
      <SearchBar
        :initial-origin="origin"
        :initial-destination="itinerary.to.value"
        :initial-date="date"
        :initial-date-to="dateTo"
        :initial-stops="itinerary.stops.value"
        :initial-mode="mode"
        @search="search"
      />
      <div class="min-h-0 flex-1 overflow-hidden rounded-2xl bg-white/95 p-3 shadow-xl ring-1 ring-black/5 backdrop-blur">
        <RoutePanel
          v-if="isRoute"
          :route="itinerary.route.value"
          :pending="itinerary.pending.value"
          :error="itinerary.error.value"
          :selected="selectedRoute"
          @select="selectedRoute = $event"
          @retry="itinerary.refresh()"
        />
        <ResultsRail
          v-else
          :result="result"
          :pending="pending"
          :error="error"
          :returns="returnsByDest"
          :returns-loading="returnsLoading"
          @show-returns="onShowReturns"
          @hover="hovered = $event"
          @retry="refresh"
        />
      </div>
      <p class="px-1 text-[11px] text-rail-soft/80">
        Données <a class="underline" href="https://data.sncf.com/explore/dataset/tgvmax/" target="_blank" rel="noopener">open data SNCF</a> ·
        carte © OpenStreetMap, MapLibre
      </p>
    </div>
  </main>
</template>
