<script setup lang="ts">
import type { SearchResult } from '~~/shared/types'
import { prettyLabel } from '~~/shared/stations'

const props = defineProps<{
  result: SearchResult | null | undefined
  pending: boolean
  error: unknown
  selected: string | null
}>()
const emit = defineEmits<{
  select: [string]
  hover: [string | null]
  retry: []
  /** Labels retenus par les filtres, ou `null` s'il n'y en a aucun. */
  'update:visible': [string[] | null]
}>()

type Sort = 'default' | 'duration' | 'popularity'
const sortBy = ref<Sort>('default')

/** Durée maximale du trajet le plus court, en minutes. `null` = pas de filtre. */
const maxDuration = ref<number | null>(null)
const DURATIONS = [
  { minutes: 120, label: '≤ 2h' },
  { minutes: 240, label: '≤ 4h' },
  { minutes: 360, label: '≤ 6h' },
]

type Period = 'morning' | 'afternoon' | 'evening'
const period = ref<Period | null>(null)
const PERIODS: Array<{ key: Period; label: string }> = [
  { key: 'morning', label: 'Matin' },
  { key: 'afternoon', label: 'Après-midi' },
  { key: 'evening', label: 'Soir' },
]

/** Nombre minimum de jours joignables, en exploration sur une plage. */
const minDays = ref<number | null>(null)
const DAY_THRESHOLDS = [2, 3, 5]

/** Le mode plage ne renvoie pas d'horaires, seulement des jours : filtrer sur la durée n'a rien à mordre. */
const isRange = computed(() => props.result?.mode === 'range')

function inPeriod(hhmm: string, p: Period): boolean {
  const hour = Number(hhmm.slice(0, 2))
  if (p === 'morning') return hour < 12
  if (p === 'afternoon') return hour >= 12 && hour < 18
  return hour >= 18
}

const all = computed(() => props.result?.destinations ?? [])

const filtered = computed(() => {
  let list = all.value
  if (isRange.value) {
    if (minDays.value) list = list.filter((d) => (d.availableDates?.length ?? 0) >= minDays.value!)
    return list
  }
  if (maxDuration.value) {
    list = list.filter((d) => {
      const best = fastestTrip(d.trains)
      return best ? tripDurationMin(best) <= maxDuration.value! : false
    })
  }
  if (period.value) {
    list = list.filter((d) => d.trains.some((t) => inPeriod(t.departure, period.value!)))
  }
  return list
})

const visible = computed(() => {
  const list = [...filtered.value]
  if (sortBy.value === 'popularity') {
    return list.sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1) || a.label.localeCompare(b.label))
  }
  if (sortBy.value === 'duration') {
    // Une destination sans horaire connu ne peut pas être classée par durée : elle passe en fin.
    const key = (d: (typeof list)[number]) => {
      const best = fastestTrip(d.trains)
      return best ? tripDurationMin(best) : Number.POSITIVE_INFINITY
    }
    return list.sort((a, b) => key(a) - key(b) || a.label.localeCompare(b.label))
  }
  return list
})

const isFiltering = computed(() => Boolean(maxDuration.value || period.value || minDays.value))

// La carte doit montrer exactement ce que la liste montre : « 20 affichées » au-dessus de
// 74 points sur la carte, ce sont deux réponses différentes à la même question.
watch(
  [filtered, isFiltering],
  () => emit('update:visible', isFiltering.value ? filtered.value.map((d) => d.label) : null),
  { immediate: true },
)

function clearFilters() {
  maxDuration.value = null
  period.value = null
  minDays.value = null
}

const hubName = computed(() => (props.result ? prettyLabel(props.result.origin.label) : ''))
const noun = computed(() => (props.result?.mode === 'to' ? 'origine' : 'destination'))

// Contour sur fond blanc au repos : un aplat gris se lit comme une étiquette morte,
// pas comme une option qu'on peut activer.
// Six pastilles doivent tenir sur une seule ligne dans 360 px : au-delà, « Soir » se
// retrouve orphelin sur une deuxième rangée.
const CHIP = 'rounded-full border px-2 py-1 text-xs font-medium transition'
const CHIP_ON = 'border-accent bg-accent text-white'
const CHIP_OFF = 'border-slate-200 bg-white text-rail-soft hover:border-slate-300 hover:text-rail'
</script>

<template>
  <div class="flex h-full flex-col gap-2">
    <LoadingCards v-if="pending" label="Recherche des destinations…" />

    <div v-else-if="error" class="p-4">
      <p class="text-red-600">Impossible de récupérer les données SNCF.</p>
      <button class="mt-2 rounded-md bg-rail px-3 py-1.5 text-sm text-white" @click="emit('retry')">
        Réessayer
      </button>
    </div>

    <template v-else-if="result">
      <!-- Le tri partage la ligne du décompte, qui a de la place : une rangée de
           contrôles en moins au-dessus d'une liste qu'on veut voir. -->
      <div class="flex items-baseline gap-2 px-0.5">
        <p class="min-w-0 flex-1 truncate text-sm text-rail-soft">
          <strong class="text-rail">{{ all.length }}</strong>
          {{ noun }}<template v-if="all.length > 1">s</template>
          <template v-if="result.mode === 'to'"> vers </template>
          <template v-else> depuis </template>
          <strong class="text-rail">{{ hubName }}</strong>
          <template v-if="isFiltering">
            <span class="text-slate-300"> · </span>{{ filtered.length }} affichée<template v-if="filtered.length > 1">s</template>
          </template>
        </p>
        <div v-if="all.length > 1" class="relative shrink-0">
          <select
            v-model="sortBy"
            data-test="sort"
            aria-label="Trier les résultats"
            class="cursor-pointer appearance-none rounded-md bg-transparent py-0.5 pl-1.5 pr-5 text-xs font-medium text-rail-soft outline-none transition hover:text-rail"
          >
            <option value="default">{{ isRange ? 'Jours' : 'A → Z' }}</option>
            <option v-if="!isRange" value="duration">Durée</option>
            <option value="popularity">Notoriété</option>
          </select>
          <svg class="pointer-events-none absolute right-1 top-1/2 h-3 w-3 -translate-y-1/2 text-rail-soft" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>

      <!-- Filtres : sur 130 destinations, restreindre bat n'importe quel tri -->
      <div v-if="all.length > 1" class="flex flex-wrap items-center gap-1.5 px-0.5">
        <template v-if="isRange">
          <button
            v-for="n in DAY_THRESHOLDS"
            :key="n"
            type="button"
            :class="[CHIP, minDays === n ? CHIP_ON : CHIP_OFF]"
            @click="minDays = minDays === n ? null : n"
          >
            {{ n }} j et +
          </button>
        </template>
        <template v-else>
          <button
            v-for="d in DURATIONS"
            :key="d.minutes"
            type="button"
            :data-test="`filter-duration-${d.minutes}`"
            :class="[CHIP, maxDuration === d.minutes ? CHIP_ON : CHIP_OFF]"
            @click="maxDuration = maxDuration === d.minutes ? null : d.minutes"
          >
            {{ d.label }}
          </button>
          <button
            v-for="p in PERIODS"
            :key="p.key"
            type="button"
            :data-test="`filter-period-${p.key}`"
            :class="[CHIP, period === p.key ? CHIP_ON : CHIP_OFF]"
            @click="period = period === p.key ? null : p.key"
          >
            {{ p.label }}
          </button>
        </template>
        <button
          v-if="isFiltering"
          type="button"
          class="ml-auto text-xs text-rail-soft underline hover:text-rail"
          @click="clearFilters"
        >
          Effacer
        </button>
      </div>

      <!-- Pleine largeur, séparées par des filets : 74 rectangles bordés faisaient une
           échelle. La marge négative annule le padding de la colonne.
           `pb-14` sur mobile : de quoi faire défiler la dernière destination au-dessus de
           la bascule carte / liste, qui flotte par-dessus le bas de la liste. Du défilement
           en plus, pas de la hauteur utile en moins. -->
      <ul v-if="visible.length" class="-mx-3 divide-y divide-slate-100 overflow-auto border-t border-slate-100 pb-14 md:pb-0">
        <DestinationCard
          v-for="d in visible"
          :key="d.label"
          :destination="d"
          :mode="result.mode"
          :selected="d.label === selected"
          @select="emit('select', $event)"
          @hover="emit('hover', $event)"
        />
      </ul>

      <p v-else-if="isFiltering" class="px-0.5 py-3 text-sm text-rail-soft">
        Aucune {{ noun }} ne passe ce filtre.
        <button type="button" class="underline hover:text-rail" @click="clearFilters">Tout afficher</button>
      </p>

      <p v-else class="p-4 text-rail-soft">
        <template v-if="result.mode === 'to'">
          Aucune origine TGVmax vers cette gare ce jour-là.
        </template>
        <template v-else-if="result.mode === 'roundtrip'">
          Aucune destination n'a l'aller <em>et</em> le retour réservables à ces dates.
          Essayez de décaler le retour d'un jour.
        </template>
        <template v-else>
          Aucune destination TGVmax réservable sur cette période.
        </template>
      </p>
    </template>

    <div v-else class="p-4 text-rail-soft">
      Choisissez une gare et une date pour voir les destinations TGVmax disponibles.
    </div>
  </div>
</template>
