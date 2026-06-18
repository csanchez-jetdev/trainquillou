<script setup lang="ts">
import type { ReturnDatesResult } from '~~/shared/types'

const { origin, date, dateTo, mode, result, pending, error, search, refresh } = useSearch()
const itinerary = useItinerary()
const { cache: returnsCache, loading: returnsLoading, load: loadReturns } = useReturns()
const hovered = ref<string | null>(null)
const selectedRoute = ref(0)

const isRoute = computed(() => mode.value === 'route')

// L'état de chargement de l'itinéraire est client-only (fetch côté client). On ne
// l'expose qu'après le montage pour éviter un mismatch d'hydratation sur le bouton.
const isMounted = ref(false)
onMounted(() => (isMounted.value = true))
const searchLoading = computed(() => isMounted.value && (isRoute.value ? itinerary.pending.value : pending.value))

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

// Relance la recherche d'itinéraire sur une date suggérée.
function onPickRouteDate(d: string) {
  search({
    mode: 'route',
    origin: itinerary.from.value,
    destination: itinerary.to.value,
    date: d,
    stops: itinerary.stops.value,
  })
}

useHead({ title: 'Trainquillou — explorer les destinations TGVmax' })
</script>

<template>
  <div class="flex h-[100dvh] flex-col bg-slate-100">
    <!-- En-tête de l'app -->
    <header class="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <NuxtLink to="/" class="flex items-center gap-2 font-bold tracking-tight text-rail">
        <span class="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm text-white">T</span>
        Trainquillou
      </NuxtLink>
      <NuxtLink to="/" class="text-sm font-medium text-rail-soft transition hover:text-rail">
        ← Accueil
      </NuxtLink>
    </header>

    <!-- Corps : sidebar + carte (empilés sur mobile, côte à côte sur desktop) -->
    <div class="flex min-h-0 flex-1 flex-col md:flex-row">
      <!-- Carte : en haut sur mobile, à droite sur desktop -->
      <div class="relative order-1 h-[38vh] shrink-0 md:order-2 md:h-auto md:flex-1">
        <MapView
          class="absolute inset-0"
          :result="isRoute ? null : result"
          :route="isRoute ? itinerary.route.value : null"
          :selected-route="selectedRoute"
          :hovered="hovered"
        />
      </div>

      <!-- Panneau latéral : recherche + résultats -->
      <aside class="order-2 flex min-h-0 flex-1 flex-col bg-white md:order-1 md:w-[24rem] md:flex-none md:border-r md:border-slate-200">
        <div class="shrink-0 border-b border-slate-100 p-3">
          <SearchBar
            :initial-origin="origin"
            :initial-destination="itinerary.to.value"
            :initial-date="date"
            :initial-date-to="dateTo"
            :initial-stops="itinerary.stops.value"
            :initial-mode="mode"
            :loading="searchLoading"
            @search="search"
          />
        </div>

        <div class="min-h-0 flex-1 overflow-hidden px-3 py-2">
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
            :returns="returnsByDest"
            :returns-loading="returnsLoading"
            @show-returns="onShowReturns"
            @hover="hovered = $event"
            @retry="refresh"
          />
        </div>

        <p class="shrink-0 border-t border-slate-100 px-3 py-2 text-[11px] text-rail-soft/80">
          Données <a class="underline" href="https://data.sncf.com/explore/dataset/tgvmax/" target="_blank" rel="noopener">open data SNCF</a> ·
          carte © OpenStreetMap, MapLibre
        </p>
      </aside>
    </div>
  </div>
</template>
