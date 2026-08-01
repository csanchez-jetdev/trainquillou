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

const CHIP = 'rounded-full px-2 py-0.5 text-xs font-medium transition'
const CHIP_ON = 'bg-accent text-white'
const CHIP_OFF = 'bg-slate-100 text-rail-soft hover:bg-slate-200'
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
      <p class="px-0.5 text-sm text-rail-soft">
        <strong class="text-rail">{{ all.length }}</strong>
        {{ noun }}<template v-if="all.length > 1">s</template>
        <template v-if="result.mode === 'to'"> vers </template>
        <template v-else> depuis </template>
        <strong class="text-rail">{{ hubName }}</strong>
        <template v-if="isFiltering">
          <span class="text-slate-300"> · </span>{{ filtered.length }} affichée<template v-if="filtered.length > 1">s</template>
        </template>
      </p>

      <!-- Filtres : sur 130 destinations, restreindre bat n'importe quel tri -->
      <div v-if="all.length > 1" class="flex flex-wrap items-center gap-1 px-0.5">
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
          <span class="mx-0.5 h-4 w-px bg-slate-200" />
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

      <div v-if="all.length > 1" class="flex items-center gap-1.5 px-0.5 text-xs text-rail-soft">
        <span>Trier :</span>
        <button
          type="button"
          :class="sortBy === 'default' ? 'font-semibold text-accent-strong' : 'hover:text-rail'"
          @click="sortBy = 'default'"
        >
          {{ isRange ? 'jours' : 'A→Z' }}
        </button>
        <template v-if="!isRange">
          <span class="text-slate-300">·</span>
          <button
            type="button"
            data-test="sort-duration"
            :class="sortBy === 'duration' ? 'font-semibold text-accent-strong' : 'hover:text-rail'"
            @click="sortBy = 'duration'"
          >
            durée
          </button>
        </template>
        <span class="text-slate-300">·</span>
        <button
          type="button"
          data-test="sort-popularity"
          :class="sortBy === 'popularity' ? 'font-semibold text-accent-strong' : 'hover:text-rail'"
          @click="sortBy = 'popularity'"
        >
          notoriété ★
        </button>
      </div>

      <ul v-if="visible.length" class="flex flex-col gap-1.5 overflow-auto pb-2 pr-1">
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
