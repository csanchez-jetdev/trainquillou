<script setup lang="ts">
import type { SearchMode } from '~~/shared/types'
import { todayISO, lastBookableISO, BOOKING_WINDOW_DAYS } from '~~/shared/window'
import { cleanString, isKnownStation } from '~~/shared/normalize'

type BarMode = SearchMode | 'route'
type DateKind = 'single' | 'roundtrip' | 'range'

const props = defineProps<{
  initialOrigin?: string
  initialDestination?: string
  initialDate?: string
  initialDateTo?: string
  initialStops?: string
  initialMode?: BarMode
  loading?: boolean
}>()
const emit = defineEmits<{
  search: [{ origin: string; destination?: string; date: string; dateTo?: string; stops?: string; mode: BarMode }]
}>()

const from = ref('')
const to = ref('')
const dateKind = ref<DateKind>('single')
const date = ref('')
const dateTo = ref('')
const stops = ref('2')

type Blame = { message: string; field: 'from' | 'to' | 'date' | 'dateTo' }
const blame = ref<Blame | null>(null)
const blameId = useId()
const { push: toast } = useToasts()

function reject(field: Blame['field'], message: string) {
  blame.value = { message, field }
  toast(message, 'error')
}

const invalid = (field: Blame['field']) => blame.value?.field === field
const describedBy = (field: Blame['field']) => (invalid(field) ? blameId : undefined)

watch([from, to, date, dateTo], () => (blame.value = null))

// Re-seeded on every change: history and searches launched from a result move the query too.
function seedFromQuery() {
  const m = props.initialMode ?? 'from'
  from.value = m === 'to' ? '' : props.initialOrigin ?? ''
  to.value = m === 'to' ? props.initialOrigin ?? '' : m === 'route' ? props.initialDestination ?? '' : ''
  dateKind.value = m === 'roundtrip' ? 'roundtrip' : m === 'range' ? 'range' : 'single'
  date.value = props.initialDate ?? ''
  dateTo.value = props.initialDateTo ?? ''
  stops.value = props.initialStops ?? '2'
}
seedFromQuery()
watch(
  () => [
    props.initialMode, props.initialOrigin, props.initialDestination,
    props.initialDate, props.initialDateTo, props.initialStops,
  ],
  seedFromQuery,
)

// Free seats only open 30 days out; beyond that the dataset is empty, which reads as a bug.
const today = todayISO()
const lastBookable = lastBookableISO()

const hasFrom = computed(() => Boolean(from.value.trim()))
const hasTo = computed(() => Boolean(to.value.trim()))

/** The dataset allows a city to itself (Part-Dieu → Perrache); we do not. */
const sameStation = computed(
  () => hasFrom.value && hasTo.value && cleanString(from.value) === cleanString(to.value),
)

const { stations } = useStations()
const unknownStation = (label: string) => !isKnownStation(label, stations.value)

// An empty form cannot express "search backwards": the URL carries it until a station is typed.
const pendingMode = ref<BarMode | null>(
  props.initialMode === 'to' || props.initialMode === 'route' ? props.initialMode : null,
)
watch([from, to], () => (pendingMode.value = null))

const canPickDateKind = computed(() => !hasTo.value)
watch(canPickDateKind, (ok) => {
  if (!ok) dateKind.value = 'single'
})

const mode = computed<BarMode>(() => {
  if (hasFrom.value && hasTo.value) return 'route'
  if (hasTo.value) return 'to'
  if (!hasFrom.value && pendingMode.value) return pendingMode.value
  if (dateKind.value === 'roundtrip') return 'roundtrip'
  if (dateKind.value === 'range') return 'range'
  return 'from'
})

const hasSecondDate = computed(() => dateKind.value !== 'single' && canPickDateKind.value)

const HINTS: Record<BarMode, string> = {
  from: 'Toutes les villes joignables ce jour-là. Renseignez « Vers » pour composer un trajet précis.',
  to: 'Recherche inversée : toutes les villes d\'où l\'on peut rejoindre cette gare.',
  roundtrip: 'Seules les villes dont l\'aller et le retour sont réservables aux deux dates.',
  range: 'Les villes joignables sur la période, avec le nombre de jours possibles pour chacune.',
  route: 'Trajet composé avec correspondances, quand aucun TGVmax direct n\'existe.',
}
const hint = computed(() => {
  if (!hasFrom.value && !hasTo.value && mode.value === 'from') {
    return 'Indiquez une gare de départ — ou seulement une gare d\'arrivée pour chercher à l\'envers.'
  }
  return HINTS[mode.value]
})

function humanDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long',
  })
}

const SUBMIT_LABELS: Record<BarMode, string> = {
  from: 'Voir les destinations',
  to: 'D\'où peut-on venir ?',
  roundtrip: 'Voir les escapades',
  range: 'Explorer la période',
  route: 'Chercher l\'itinéraire',
}
const submitLabel = computed(() => SUBMIT_LABELS[mode.value])

const firstDateLabel = computed(() => {
  if (dateKind.value === 'range') return 'Du'
  if (dateKind.value === 'roundtrip') return 'Aller'
  return 'Date'
})

function swap() {
  const previous = from.value
  from.value = to.value
  to.value = previous
}

function submit() {
  if (sameStation.value) {
    return reject('to', 'Les deux gares sont identiques.')
  }
  if (mode.value === 'route' && (!hasFrom.value || !hasTo.value)) {
    return reject(hasFrom.value ? 'to' : 'from', 'Indiquez la gare de départ et la gare d\'arrivée.')
  }
  if (!hasFrom.value && !hasTo.value) {
    return reject('from', 'Choisissez au moins une gare.')
  }
  // The API answers 400 for a label it does not know, and the rail then blames the SNCF.
  for (const [field, value] of [['from', from.value], ['to', to.value]] as const) {
    if (unknownStation(value)) {
      return reject(field, `« ${value.trim()} » n'est pas une gare de la liste.`)
    }
  }
  if (!date.value) {
    return reject('date', 'Choisissez une date.')
  }
  // A shared link can carry a date that has since fallen out of the window.
  if (date.value < today || date.value > lastBookable) {
    return reject('date', `Les places ne sont réservables que jusqu'au ${humanDate(lastBookable)}.`)
  }
  if (hasSecondDate.value) {
    if (!dateTo.value) {
      return reject('dateTo', dateKind.value === 'roundtrip' ? 'Choisissez une date de retour.' : 'Choisissez une date de fin.')
    }
    if (dateTo.value < date.value) {
      return reject('dateTo', dateKind.value === 'roundtrip'
        ? 'Le retour ne peut pas précéder l\'aller.'
        : 'La date de fin doit suivre la date de début.')
    }
    if (dateTo.value > lastBookable) {
      return reject('dateTo', `Les places ne sont réservables que jusqu'au ${humanDate(lastBookable)}.`)
    }
  }
  blame.value = null
  emit('search', {
    // In reverse search the pivot is the arrival station.
    origin: (mode.value === 'to' ? to.value : from.value).trim(),
    destination: mode.value === 'route' ? to.value.trim() : undefined,
    date: date.value,
    dateTo: hasSecondDate.value ? dateTo.value : undefined,
    stops: mode.value === 'route' ? stops.value : undefined,
    mode: mode.value,
  })
}
</script>

<template>
  <form class="flex w-full flex-col gap-2 md:flex-row md:flex-wrap" @submit.prevent="submit">
    <div class="relative order-1 rounded-xl border border-slate-200 bg-white md:flex md:min-w-[24rem] md:flex-1 md:items-stretch">
      <StationInput
        v-model="from"
        label="Depuis"
        placeholder="Paris, Lyon, Nantes…"
        test-id="input-from"
        :exclude="to"
        :invalid="invalid('from')"
        :described-by="describedBy('from')"
        class="md:min-w-0 md:flex-1"
      />
      <div class="mx-3 h-px bg-slate-100 md:mx-0 md:h-auto md:w-px md:shrink-0" />
      <!-- `md:pl-4` clears the swap button, centred on the separator and overlapping 16 px. -->
      <StationInput
        v-model="to"
        label="Vers"
        placeholder="N'importe où"
        test-id="input-to"
        :exclude="from"
        :invalid="invalid('to')"
        :described-by="describedBy('to')"
        class="md:min-w-0 md:flex-1 md:pl-4"
      />
      <button
        type="button"
        data-test="swap"
        title="Inverser le sens"
        aria-label="Inverser le sens de la recherche"
        class="absolute right-2.5 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-rail-soft shadow-sm transition hover:border-accent hover:text-accent-strong md:left-1/2 md:right-auto md:-translate-x-1/2 md:rotate-90"
        @click="swap"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
        </svg>
      </button>
    </div>

    <!-- `md:contents`: on the bar the rows vanish and their cells become the frame's own. -->
    <div class="order-2 rounded-xl border border-slate-200 bg-white md:flex md:flex-none md:items-stretch">
      <div class="grid grid-cols-2 md:contents">
        <div class="rounded-[11px] px-3 py-2 md:min-w-[8.5rem] md:flex-1" :class="invalid('date') && 'tq-invalid'">
          <span class="block text-xs font-medium text-rail-soft">{{ firstDateLabel }}</span>
          <input
            v-model="date"
            type="date"
            :min="today"
            :max="lastBookable"
            :aria-invalid="invalid('date') || undefined"
            :aria-describedby="describedBy('date')"
            class="mt-0.5 w-full bg-transparent text-[15px] font-medium text-rail outline-none"
          >
        </div>
        <div class="relative border-l border-slate-100 px-3 py-2 md:min-w-[9rem] md:flex-1">
          <label for="tq-date-kind" class="block text-xs font-medium text-rail-soft">Voyage</label>
          <select
            id="tq-date-kind"
            v-model="dateKind"
            data-test="date-kind"
            class="mt-0.5 w-full appearance-none bg-transparent pr-5 text-[15px] font-medium text-rail outline-none disabled:text-rail-soft"
            :disabled="!canPickDateKind"
          >
            <option value="single">Aller simple</option>
            <option value="roundtrip">Aller-retour</option>
            <option value="range">Plusieurs jours</option>
          </select>
          <svg class="pointer-events-none absolute bottom-3 right-3 h-3.5 w-3.5 text-rail-soft" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>

      <!-- One cell, but the grid stays: full width would misalign the field's calendar icon. -->
      <div v-if="hasSecondDate" class="grid grid-cols-2 border-t border-slate-100 md:contents">
        <div
          class="rounded-[11px] px-3 py-2 md:min-w-[8.5rem] md:flex-1 md:border-l md:border-slate-100"
          :class="invalid('dateTo') && 'tq-invalid'"
        >
          <span class="block text-xs font-medium text-rail-soft">
            {{ dateKind === 'roundtrip' ? 'Retour' : 'Au' }}
          </span>
          <input
            v-model="dateTo"
            type="date"
            data-test="date-to"
            :min="date || today"
            :max="lastBookable"
            :aria-invalid="invalid('dateTo') || undefined"
            :aria-describedby="describedBy('dateTo')"
            class="mt-0.5 w-full bg-transparent text-[15px] font-medium text-rail outline-none"
          >
        </div>
      </div>

      <div v-if="mode === 'route'" class="grid grid-cols-2 border-t border-slate-100 md:contents">
        <div class="relative px-3 py-2 md:min-w-[9rem] md:flex-1 md:border-l md:border-slate-100">
          <label for="tq-stops" class="block text-xs font-medium text-rail-soft">Correspondances</label>
          <select
            id="tq-stops"
            v-model="stops"
            data-test="stops-select"
            class="mt-0.5 w-full appearance-none bg-transparent pr-5 text-[15px] font-medium text-rail outline-none"
          >
            <option value="0">Direct</option>
            <option value="1">≤ 1</option>
            <option value="2">≤ 2</option>
            <option value="3">≤ 3 (plus lent)</option>
          </select>
          <svg class="pointer-events-none absolute bottom-3 right-3 h-3.5 w-3.5 text-rail-soft" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
    </div>

    <div class="order-3 flex flex-col gap-1 px-0.5 md:order-4 md:w-full md:flex-row md:flex-wrap md:items-baseline md:gap-x-2">
      <p
        v-if="sameStation"
        data-test="same-station"
        class="text-xs leading-snug font-medium text-amber-600"
      >
        Départ et arrivée sont la même ville : choisissez-en une autre, ou videz « Vers » pour
        voir toutes les destinations.
      </p>
      <p v-else data-test="search-hint" class="text-xs leading-snug text-rail-soft">
        {{ hint }}
      </p>

      <p class="text-[11px] leading-snug text-rail-soft">
        Places à 0 € ouvertes {{ BOOKING_WINDOW_DAYS }} jours avant le départ : jusqu'au
        {{ humanDate(lastBookable) }}.
      </p>
    </div>

    <p v-if="blame" :id="blameId" data-test="submit-error" class="sr-only">{{ blame.message }}</p>

    <!-- `submit` still validates: Enter submits the form even when its button is disabled. -->
    <button
      type="submit"
      :disabled="loading || sameStation"
      :class="[
        'order-5 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white transition md:order-3 md:w-auto md:shrink-0',
        sameStation ? 'cursor-not-allowed bg-slate-300' : 'bg-coral hover:bg-coral-strong disabled:opacity-70',
      ]"
    >
      <Spinner v-if="loading" :size="16" />
      <span>{{ loading ? 'Recherche…' : submitLabel }}</span>
    </button>
  </form>
</template>
