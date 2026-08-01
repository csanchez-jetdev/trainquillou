<script setup lang="ts">
import type { ReturnDatesResult } from '~~/shared/types'
import { prettyLabel } from '~~/shared/stations'

const { origin, date, dateTo, mode, result, pending, error, search, refresh } = useSearch()
const itinerary = useItinerary()
const { cache: returnsCache, loading: returnsLoading, load: loadReturns } = useReturns()
const hovered = ref<string | null>(null)
const selectedRoute = ref(0)
/** Destination dont la fiche est ouverte sur la carte. */
const selectedDestination = ref<string | null>(null)
/** Labels retenus par les filtres du rail ; `null` quand aucun filtre n'est actif. */
const visibleLabels = ref<string[] | null>(null)

// Une nouvelle recherche invalide la sélection : la gare peut ne plus être dans les résultats.
watch(result, () => { selectedDestination.value = null })

// Filtrer jusqu'à masquer la destination ouverte laisserait sa fiche ancrée sur un marqueur
// qui n'existe plus.
watch(visibleLabels, (labels) => {
  if (labels && selectedDestination.value && !labels.includes(selectedDestination.value)) {
    selectedDestination.value = null
  }
})

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

/**
 * Sur un écran étroit, le formulaire et la carte se partagent déjà toute la hauteur : laissé
 * déplié, il ne reste plus un pixel pour les résultats. Il se replie donc en un résumé dès
 * qu'une recherche a abouti. Sur desktop la colonne est assez haute, il reste ouvert.
 */
const isNarrow = ref(false)
const formOpen = ref(true)
onMounted(() => {
  const mq = window.matchMedia('(max-width: 767px)')
  isNarrow.value = mq.matches
  mq.addEventListener('change', (e) => (isNarrow.value = e.matches))
})
watch([result, () => itinerary.route.value], () => {
  if (isNarrow.value) formOpen.value = false
})
function onSearch(params: Parameters<typeof search>[0]) {
  search(params)
  if (isNarrow.value) formOpen.value = false
}

/** Résumé de la recherche en cours, affiché à la place du formulaire replié. */
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
        <img src="/logo-mark.png" alt="Trainquillou" class="h-8 w-8 object-contain">
        Trainquillou
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
          :selected="selectedDestination"
          :visible-labels="visibleLabels"
          :returns-loading="returnsLoading"
          :returns="returnsByDest"
          @select="selectedDestination = $event"
          @show-returns="onShowReturns"
        />
      </div>

      <!-- Panneau latéral : recherche + résultats -->
      <aside class="order-2 flex min-h-0 flex-1 flex-col bg-white md:order-1 md:w-[24rem] md:flex-none md:border-r md:border-slate-200">
        <div class="shrink-0 border-b border-slate-100 p-3">
          <!-- Formulaire replié : résumé cliquable, écran étroit uniquement -->
          <button
            v-if="isNarrow && !formOpen && summary"
            type="button"
            data-test="expand-search"
            class="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-accent"
            @click="formOpen = true"
          >
            <span class="min-w-0 flex-1 truncate text-sm font-semibold text-rail">{{ summary }}</span>
            <span class="shrink-0 text-xs font-medium text-accent-strong">Modifier</span>
          </button>

          <SearchBar
            v-show="formOpen || !isNarrow"
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
            :selected="selectedDestination"
            @select="selectedDestination = selectedDestination === $event ? null : $event"
            @update:visible="visibleLabels = $event"
            @hover="hovered = $event"
            @retry="refresh"
          />
        </div>

        <p class="shrink-0 border-t border-slate-100 px-3 py-2 text-[11px] text-rail-soft/80">
          Données <a class="underline" href="https://data.sncf.com/explore/dataset/tgvmax/" target="_blank" rel="noopener">open data SNCF</a> ·
          fond de carte <a class="underline" href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, données
          <a class="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
        </p>
      </aside>
    </div>
  </div>
</template>
