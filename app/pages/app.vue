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
// Ne replier que sur une recherche qui a effectivement abouti : `useItinerary` étant
// `server: false`, son résultat passe de `undefined` à `null` au montage, et ce seul
// changement suffisait à replier un formulaire qui n'avait encore rien à résumer.
watch([result, () => itinerary.route.value], ([found, foundRoute]) => {
  if (isNarrow.value && (found || foundRoute)) formOpen.value = false
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

/**
 * État replié, dérivé plutôt que déclaré : il exige un résumé à afficher, ce qui garantit
 * qu'un des deux affichages est toujours visible et jamais une colonne de recherche vide.
 */
const collapsed = computed(() => isNarrow.value && !formOpen.value && Boolean(summary.value))

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

/**
 * L'application vit dans son URL (`?origin=&date=&mode=`), ce qui en fait une
 * infinité d'adresses distinctes servant la même coquille : le maillage en génère
 * déjà six cents depuis les pages gare et la page d'accueil. Sans canonique elles
 * s'indexent séparément, toutes avec le même titre et aucun contenu rendu côté
 * serveur, et diluent le budget de crawl sur des variantes vides.
 *
 * `noindex, follow` plutôt qu'une simple canonique : il n'y a rien à indexer ici
 * (les résultats sont chargés côté client), mais les liens sortants doivent
 * continuer à transmettre leur poids.
 */
const { public: { siteUrl } } = useRuntimeConfig()

useHead({
  title: 'Trainquillou — explorer les destinations TGVmax',
  meta: [{ name: 'robots', content: 'noindex, follow' }],
  link: [{ rel: 'canonical', href: `${siteUrl.replace(/\/$/, '')}/app` }],
})
</script>

<template>
  <div class="flex h-[100dvh] flex-col bg-slate-100">
    <!-- En-tête de l'app -->
    <header class="z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
      <NuxtLink to="/" class="flex items-center gap-2 font-bold tracking-tight text-rail">
        <img src="/logo-mark.png" alt="Trainquillou" class="h-8 w-8 object-contain">
        Trainquillou
      </NuxtLink>
      <GithubLink class="text-rail-soft transition hover:text-rail" />
    </header>

    <!--
      Trois blocs, deux dispositions. Sur écran étroit : recherche, carte, résultats —
      la recherche d'abord, puisque c'est par elle qu'on commence et qu'elle se replie
      ensuite en résumé pour laisser la hauteur aux résultats. Sur desktop : recherche et
      résultats en colonne à gauche, carte à droite sur toute la hauteur.

      Une grille plutôt qu'un flex ordonné : la carte doit s'intercaler entre les deux
      autres blocs sur mobile et les couvrir tous les deux sur desktop, ce qu'un simple
      changement d'ordre ne sait pas faire.
    -->
    <div class="grid min-h-0 flex-1 grid-rows-[auto_32dvh_minmax(0,1fr)] md:grid-cols-[24rem_minmax(0,1fr)] md:grid-rows-[auto_minmax(0,1fr)]">
      <!-- Recherche. `relative z-10` : les suggestions de gare doivent passer par-dessus
           la carte, qui est son voisin immédiat sur mobile. -->
      <div class="relative z-10 border-b border-slate-100 bg-white p-3 md:col-start-1 md:row-start-1 md:border-r md:border-slate-200">
        <!-- Formulaire replié : résumé cliquable, écran étroit uniquement -->
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

      <!-- Carte -->
      <div class="relative md:col-start-2 md:row-start-1 md:row-end-3">
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

      <!-- Résultats -->
      <aside class="flex min-h-0 flex-col bg-white md:col-start-1 md:row-start-2 md:border-r md:border-slate-200">
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
