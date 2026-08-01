<script setup lang="ts">
import type { ReturnDatesResult } from '~~/shared/types'
import { prettyLabel } from '~~/shared/stations'

const { origin, date, dateTo, mode, hasQuery, result, pending, error, search, refresh } = useSearch()
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

/**
 * Sur un écran étroit, carte et liste ne tiennent pas ensemble : la carte réduite au
 * tiers de la hauteur ne séparait pas les marqueurs franciliens, et les trois
 * destinations qui restaient visibles ne faisaient pas une liste. On en montre donc
 * une seule à la fois, au choix.
 */
const mobileView = ref<'map' | 'list'>('list')
const MOBILE_VIEWS = [
  { key: 'map', label: 'Carte', icon: 'M12 21c4-4.6 6-7.8 6-10.5a6 6 0 1 0-12 0C6 13.2 8 16.4 12 21Zm0-9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z' },
  { key: 'list', label: 'Liste', icon: 'M4 6h16M4 12h16M4 18h16' },
] as const

onMounted(() => {
  const mq = window.matchMedia('(max-width: 767px)')
  isNarrow.value = mq.matches
  mq.addEventListener('change', (e) => (isNarrow.value = e.matches))
  // Sans recherche en cours, la liste n'a qu'une phrase à afficher : la carte fait un
  // meilleur écran d'accueil. Avec une recherche — lien partagé, retour navigateur —
  // les résultats arrivent, autant ouvrir là où ils vont s'afficher.
  mobileView.value = hasQuery.value ? 'list' : 'map'
})
// Ne replier que sur une recherche qui a effectivement abouti : `useItinerary` étant
// `server: false`, son résultat passe de `undefined` à `null` au montage, et ce seul
// changement suffisait à replier un formulaire qui n'avait encore rien à résumer.
watch([result, () => itinerary.route.value], ([found, foundRoute]) => {
  if (isNarrow.value && (found || foundRoute)) formOpen.value = false
})
function onSearch(params: Parameters<typeof search>[0]) {
  search(params)
  if (!isNarrow.value) return
  formOpen.value = false
  // Vers la liste : c'est elle qui porte le squelette de chargement, le message d'erreur
  // et son bouton de reprise, le décompte, le tri et les filtres. Rester sur la carte
  // laisserait la recherche sans retour visible pendant qu'elle tourne.
  mobileView.value = 'list'
}

/** Sur desktop les deux affichages cohabitent ; sur écran étroit la bascule tranche. */
const showList = computed(() => !isNarrow.value || mobileView.value === 'list')
/**
 * Carte recouverte par la liste : elle reste dimensionnée mais sort du parcours clavier
 * et de l'arbre d'accessibilité, sinon ses marqueurs — qui sont des boutons — restent
 * atteignables derrière la liste qui les cache.
 */
const mapCovered = computed(() => isNarrow.value && showList.value)

/**
 * Ouvrir une fiche depuis la liste, sur écran étroit, suppose de passer sur la carte :
 * c'est là qu'elle s'ancre, et un appui sans effet visible se lit comme une panne.
 * Et toujours sélectionner, jamais désélectionner — le second appui d'une bascule n'a
 * pas de sens quand on n'a pas vu le résultat du premier.
 */
function onSelectDestination(label: string) {
  if (isNarrow.value && mobileView.value === 'list') {
    selectedDestination.value = label
    mobileView.value = 'map'
    return
  }
  selectedDestination.value = selectedDestination.value === label ? null : label
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
        <!-- Décoratif : le mot « Trainquillou » suit dans le même lien. -->
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
      Trois blocs, deux dispositions. Sur écran étroit, la recherche en haut puis carte et
      liste dans une seule et même cellule, superposées, la bascule flottante du bas
      décidant laquelle est devant. Superposées et non alternées : la carte reste toujours
      dimensionnée, ce qui compte parce que son cadrage se calcule sur la taille du
      conteneur — masquée en `display:none` pendant qu'une recherche aboutit, elle
      cadrerait sur 0 × 0 et reviendrait sur une vue fausse.
      Sur desktop : la recherche en barre au-dessus des deux colonnes, résultats à gauche,
      carte à droite. Elle traversait avant la seule colonne de gauche, où elle occupait
      309 px de haut — davantage que la liste sous elle.

      Les trois blocs portent un `col-start-1` explicite. Sans lui, deux éléments qui
      demandent la même ligne sans préciser leur colonne ne se superposent pas : le
      placement automatique crée une colonne implicite pour le second, et carte et liste
      se retrouvaient côte à côte, chacune sur la moitié d'un écran de téléphone.

      Et un empilement explicite, puisque ces blocs se recouvrent : carte à 0, résultats
      à 1, suggestions de gare à 10. Le `z-0` de la carte n'est pas décoratif, il lui donne
      un contexte d'empilement : sans lui ses propres calques — l'attribution MapLibre monte
      à 2, la fiche de destination à 20 — remontent dans le contexte parent et repassent
      par-dessus la liste censée les cacher.
    -->
    <div class="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] md:grid-cols-[24rem_minmax(0,1fr)]">
      <!-- Recherche. `relative z-10` : les suggestions de gare doivent passer par-dessus
           la carte et la liste, ses voisines immédiates. -->
      <div class="relative z-10 col-start-1 row-start-1 border-b border-slate-100 bg-white p-3 md:col-span-2 md:border-slate-200">
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

      <!-- Carte. Toujours montée et dimensionnée ; sur mobile la liste passe par-dessus. -->
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
        Résultats. Même cellule que la carte sur mobile, donc positionnés eux aussi : un
        bloc resté dans le flux passe sous n'importe quel frère positionné, quel que soit
        l'ordre du DOM.

        En vue carte il ne reste que la ligne d'attribution, et le reste laisse passer les
        gestes vers la carte.
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

        <!-- Pile du bas : la bascule flotte, l'attribution reste dans le flux. Le `relative`
             est là pour que la première s'ancre sur la seconde. -->
        <div class="relative shrink-0">
          <!--
            Bascule carte / liste, écran étroit uniquement. Flottante, donc sans coût sur la
            hauteur utile — ce que la remontée de la recherche cherchait justement à gagner —
            et au pouce plutôt qu'en haut de l'écran. `bottom-full` la cale juste au-dessus
            de l'attribution au lieu de la lui faire recouvrir.
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

          <!-- Visible dans les deux affichages, en filet translucide au-dessus de la carte
               quand c'est elle qui est devant : elle utilise les mêmes données. -->
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
