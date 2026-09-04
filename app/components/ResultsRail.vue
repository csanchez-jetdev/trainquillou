<script setup lang="ts">
import type { ReturnDatesResult, SearchResult } from '~~/shared/types'
import { prettyLabel } from '~~/shared/stations'

const props = defineProps<{
  result: SearchResult | null | undefined
  pending: boolean
  error: unknown
  selected: string | null
  /** Narrow screens show the detail in a sheet over the map, not in the list. */
  narrow?: boolean
  returnsLoading?: string | null
  returns?: Record<string, ReturnDatesResult>
}>()
const emit = defineEmits<{
  select: [string]
  hover: [string | null]
  retry: []
  'show-returns': [string]
  'pick-return': [destination: string, date: string]
  /** Labels kept by the filters, or `null` when none is active. */
  'update:visible': [string[] | null]
}>()

type Sort = 'default' | 'duration' | 'popularity'
const sortBy = ref<Sort>('default')

/** Longest acceptable fastest trip, in minutes; `null` = no filter. */
const maxDuration = ref<number | null>(null)
const DURATIONS = DURATION_BANDS.slice(0, 3).map((b) => ({ minutes: b.max, label: b.short }))

type Period = 'morning' | 'afternoon' | 'evening'
const period = ref<Period | null>(null)
const PERIODS: Array<{ key: Period; label: string }> = [
  { key: 'morning', label: 'Matin' },
  { key: 'afternoon', label: 'Après-midi' },
  { key: 'evening', label: 'Soir' },
]

const minDays = ref<number | null>(null)
const DAY_THRESHOLDS = [2, 3, 5]

/** Range mode returns days, not schedules: a duration filter has nothing to bite on. */
const isRange = computed(() => props.result?.mode === 'range')

function inPeriod(hhmm: string, p: Period): boolean {
  const hour = Number(hhmm.slice(0, 2))
  if (p === 'morning') return hour < 12
  if (p === 'afternoon') return hour >= 12 && hour < 18
  return hour >= 18
}

type Dest = SearchResult['destinations'][number]

function bestMinutes(d: Dest): number | null {
  const best = fastestTrip(d.trains)
  return best ? tripDurationMin(best) : null
}

const all = computed(() => props.result?.destinations ?? [])

// The duration filter applies after this one, so its chip counts are read from here.
const byPeriod = computed(() =>
  period.value
    ? all.value.filter((d) => d.trains.some((t) => inPeriod(t.departure, period.value!)))
    : all.value,
)

const filtered = computed(() => {
  if (isRange.value) {
    return minDays.value
      ? all.value.filter((d) => (d.availableDates?.length ?? 0) >= minDays.value!)
      : all.value
  }
  if (!maxDuration.value) return byPeriod.value
  return byPeriod.value.filter((d) => {
    const minutes = bestMinutes(d)
    return minutes !== null && minutes <= maxDuration.value!
  })
})

const durationCounts = computed(() =>
  DURATIONS.map((d) => byPeriod.value.filter((x) => {
    const minutes = bestMinutes(x)
    return minutes !== null && minutes <= d.minutes
  }).length),
)

const visible = computed(() => {
  const list = [...filtered.value]
  if (sortBy.value === 'popularity') {
    return list.sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1) || a.label.localeCompare(b.label))
  }
  if (sortBy.value === 'duration') {
    // A destination with no known schedule cannot be ranked by duration: it goes last.
    const key = (d: Dest) => bestMinutes(d) ?? Number.POSITIVE_INFINITY
    return list.sort((a, b) => key(a) - key(b) || a.label.localeCompare(b.label))
  }
  return list
})

const GROUP_MIN = 15

const groups = computed(() => {
  if (sortBy.value !== 'duration' || visible.value.length < GROUP_MIN) {
    return [{ key: 'all', label: null, items: visible.value }]
  }
  const out: Array<{ key: string; label: string; items: Dest[] }> = []
  for (const d of visible.value) {
    const band = durationBand(bestMinutes(d))
    const key = band?.token ?? 'unknown'
    const last = out.at(-1)
    if (last?.key === key) last.items.push(d)
    else out.push({ key, label: band?.label ?? 'horaires inconnus', items: [d] })
  }
  return out
})

const isFiltering = computed(() => Boolean(maxDuration.value || period.value || minDays.value))

watch(
  [filtered, isFiltering],
  () => emit('update:visible', isFiltering.value ? filtered.value.map((d) => d.label) : null),
  { immediate: true },
)

const list = ref<HTMLUListElement | null>(null)

// Aim at the detail, not the row: it opens under the row, which alone left it below the fold.
watch(() => props.selected, (label) => {
  if (!label) return
  nextTick(() => {
    const row = list.value?.querySelector(`[data-label="${CSS.escape(label)}"]`)
    if (!row) return
    const next = row.nextElementSibling
    const target = next && next.querySelector('[data-test="dest-detail"]') ? next : row
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
})

function clearFilters() {
  maxDuration.value = null
  period.value = null
  minDays.value = null
}

const hubName = computed(() => (props.result ? prettyLabel(props.result.origin.label) : ''))
const noun = computed(() => (props.result?.mode === 'to' ? 'origine' : 'destination'))

// Narrow enough that the three duration chips and their counts hold one row at 360 px.
const CHIP = 'rounded-full border px-1.5 py-1 text-xs font-medium transition'
// A refused request (400, bad station or date) is not a failure to retry: show what it says.
const refusal = computed(() => {
  const e = props.error as { statusCode?: number; data?: { detail?: unknown } } | null
  const detail = e?.data?.detail
  return e?.statusCode === 400 && typeof detail === 'string' ? detail : null
})

const CHIP_ON = 'border-accent bg-accent text-white'
const CHIP_OFF = 'border-slate-200 bg-white text-rail-soft hover:border-slate-300 hover:text-rail'
</script>

<template>
  <div class="flex h-full flex-col gap-2">
    <LoadingCards v-if="pending" label="Recherche des destinations…" />

    <div v-else-if="error" class="p-4">
      <p class="text-red-600">{{ refusal || 'Impossible de récupérer les données SNCF.' }}</p>
      <button
        v-if="!refusal"
        class="mt-2 rounded-md bg-rail px-3 py-1.5 text-sm text-white"
        @click="emit('retry')"
      >
        Réessayer
      </button>
    </div>

    <template v-else-if="result">
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

      <div v-if="all.length > 1" class="flex flex-col gap-1.5 px-0.5">
        <div class="flex flex-wrap items-center gap-1.5">
          <button
            v-for="n in isRange ? DAY_THRESHOLDS : []"
            :key="n"
            type="button"
            :class="[CHIP, minDays === n ? CHIP_ON : CHIP_OFF]"
            @click="minDays = minDays === n ? null : n"
          >
            {{ n }} j et +
          </button>
          <button
            v-for="(d, i) in isRange ? [] : DURATIONS"
            :key="d.minutes"
            type="button"
            :data-test="`filter-duration-${d.minutes}`"
            :disabled="!durationCounts[i]"
            :class="[CHIP, maxDuration === d.minutes ? CHIP_ON : CHIP_OFF, 'disabled:opacity-40']"
            @click="maxDuration = maxDuration === d.minutes ? null : d.minutes"
          >
            {{ d.label }}<span class="ml-1 tabular-nums opacity-70">{{ durationCounts[i] }}</span>
          </button>
          <button
            v-if="isFiltering"
            type="button"
            class="ml-auto text-xs text-rail-soft underline hover:text-rail"
            @click="clearFilters"
          >
            Effacer
          </button>
        </div>
        <div v-if="!isRange" class="flex flex-wrap items-center gap-1.5">
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
        </div>
      </div>


      <!-- `pb-14` on mobile: enough scroll to clear the floating map/list toggle. -->
      <ul v-if="visible.length" ref="list" class="-mx-3 divide-y divide-slate-100 overflow-auto border-t border-slate-100 pb-14 md:pb-0">
        <template v-for="g in groups" :key="g.key">
          <li
            v-if="g.label"
            class="sticky top-0 z-1 bg-white/95 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-rail-soft backdrop-blur-sm"
          >
            {{ g.label }} <span class="tabular-nums opacity-70">· {{ g.items.length }}</span>
          </li>
          <template v-for="d in g.items" :key="d.label">
            <DestinationCard
              :destination="d"
              :mode="result.mode"
              :selected="d.label === selected"
              :expandable="!narrow"
              @select="emit('select', $event)"
              @hover="emit('hover', $event)"
            />
            <li v-if="!narrow && d.label === selected">
              <DestinationDetail
                layout="inline"
                :destination="d"
                :mode="result.mode"
                :origin-label="result.origin.label"
                :origin-slug="result.origin.slug"
                :returns-loading="returnsLoading === d.label"
                :returns="returns?.[d.label] ?? null"
                @show-returns="emit('show-returns', $event)"
                @pick-return="(dest, on) => emit('pick-return', dest, on)"
              />
            </li>
          </template>
        </template>
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
