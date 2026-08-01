<script setup lang="ts">
import type { SearchMode } from '~~/shared/types'
import { todayISO, lastBookableISO, BOOKING_WINDOW_DAYS } from '~~/shared/window'
import { cleanString } from '~~/server/utils/normalize'

type BarMode = SearchMode | 'route'
/** How dates are picked. The search mode follows from it, it is never chosen directly. */
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

// The five search modes are derived from three fields, not picked: departure station,
// arrival station (empty = anywhere), and how dates are chosen.
const from = ref('')
const to = ref('')
const dateKind = ref<DateKind>('single')
const date = ref(props.initialDate ?? '')
const dateTo = ref(props.initialDateTo ?? '')
const stops = ref(props.initialStops ?? '2')
const error = ref('')

// The URL is the source of truth and always carries `mode`: restore the field state that
// produces it, so a shared link opens the right screen.
{
  const m = props.initialMode ?? 'from'
  if (m === 'to') to.value = props.initialOrigin ?? ''
  else from.value = props.initialOrigin ?? ''
  if (m === 'route') to.value = props.initialDestination ?? ''
  if (m === 'roundtrip') dateKind.value = 'roundtrip'
  if (m === 'range') dateKind.value = 'range'
}

// Free seats only open 30 days out; beyond that the dataset is empty and an empty result
// reads as a breakdown. The native picker refuses those dates instead.
const today = todayISO()
const lastBookable = lastBookableISO()

const hasFrom = computed(() => Boolean(from.value.trim()))
const hasTo = computed(() => Boolean(to.value.trim()))

/** A city to itself: the dataset allows it (Part-Dieu → Perrache), we do not. */
const sameStation = computed(
  () => hasFrom.value && hasTo.value && cleanString(from.value) === cleanString(to.value),
)

// Intent carried by the URL (`/app?mode=to`), until a station is typed: an empty form
// cannot express "search backwards" on its own.
const pendingMode = ref<BarMode | null>(
  props.initialMode === 'to' || props.initialMode === 'route' ? props.initialMode : null,
)
watch([from, to], () => (pendingMode.value = null))

/** Round trip and range only make sense without a fixed arrival station. */
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
  // Empty form: the moment to say the arrival station is optional.
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
    error.value = 'Les deux gares sont identiques.'
    return
  }
  if (mode.value === 'route' && (!hasFrom.value || !hasTo.value)) {
    error.value = 'Indiquez la gare de départ et la gare d\'arrivée.'
    return
  }
  if (!hasFrom.value && !hasTo.value) {
    error.value = 'Choisissez au moins une gare.'
    return
  }
  if (!date.value) {
    error.value = 'Choisissez une date.'
    return
  }
  // A shared link can carry a date that has since fallen out of the window.
  if (date.value < today || date.value > lastBookable) {
    error.value = `Les places ne sont réservables que jusqu'au ${humanDate(lastBookable)}.`
    return
  }
  if (hasSecondDate.value) {
    if (!dateTo.value) {
      error.value = dateKind.value === 'roundtrip' ? 'Choisissez une date de retour.' : 'Choisissez une date de fin.'
      return
    }
    if (dateTo.value < date.value) {
      error.value = dateKind.value === 'roundtrip'
        ? 'Le retour ne peut pas précéder l\'aller.'
        : 'La date de fin doit suivre la date de début.'
      return
    }
    if (dateTo.value > lastBookable) {
      error.value = `Les places ne sont réservables que jusqu'au ${humanDate(lastBookable)}.`
      return
    }
  }
  error.value = ''
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
  <!--
    Two layouts. A column on mobile, like a form. A horizontal bar from `md` up: stacked in a
    384 px column, these four controls took 309 px of height, more than the result list they
    produce. `flex-wrap` rather than a third width breakpoint — the bar folds into two rows on
    its own where it no longer fits, and the layout stays binary. Order follows the layout via
    `order`: the button comes after the fields on the bar, but stays under the text announcing
    what it will do in the column.
  -->
  <form class="flex w-full flex-col gap-2 md:flex-row md:flex-wrap" @submit.prevent="submit">
    <!-- The swap button sits on the divider it flips: on the frame's right edge in the
         column, between the two fields on the bar.
         `md:min-w-[24rem]` is the floor below which the bar folds rather than squeezing the
         fields further. Under 1100 px in the three-date-cell modes a long label still gets
         truncated there, which is accepted: the station is spelled out again in the results
         header just below. -->
    <div class="relative order-1 rounded-xl border border-slate-200 bg-white md:flex md:min-w-[24rem] md:flex-1 md:items-stretch">
      <StationInput
        v-model="from"
        label="Depuis"
        placeholder="Paris, Lyon, Nantes…"
        test-id="input-from"
        :exclude="to"
        class="md:min-w-0 md:flex-1"
      />
      <div class="mx-3 h-px bg-slate-100 md:mx-0 md:h-auto md:w-px md:shrink-0" />
      <!-- `md:pl-4` : de quoi dégager le libellé du bouton d'inversion, qui se centre sur
           le séparateur et empiète de 16 px de chaque côté. -->
      <StationInput
        v-model="to"
        label="Vers"
        placeholder="N'importe où"
        test-id="input-to"
        :exclude="from"
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

    <!-- When: same treatment, one frame cut into cells. `md:contents` on the rows — on the bar
         they vanish and their cells become the frame's own, without duplicating markup or
         maintaining two trees; their `border-t`, which separated the stacked rows, goes with
         them. `md:flex-none`: this frame is sized by its content, never squeezed. It holds two
         cells, three in round-trip or itinerary mode; with a grow ratio the third overflowed
         under the submit button below 1100 px. Only the journey frame stretches. -->
    <div class="order-2 rounded-xl border border-slate-200 bg-white md:flex md:flex-none md:items-stretch">
      <div class="grid grid-cols-2 md:contents">
        <div class="px-3 py-2 md:min-w-[8.5rem] md:flex-1">
          <span class="block text-xs font-medium text-rail-soft">{{ firstDateLabel }}</span>
          <input
            v-model="date"
            type="date"
            :min="today"
            :max="lastBookable"
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

      <!-- One cell, but the two-column grid stays in column layout: otherwise the field
           stretches full width and its calendar icon no longer lines up with the row above.
           The two are exclusive — a date range implies a free arrival, an itinerary a fixed
           one — so never more than one cell here. -->
      <div v-if="hasSecondDate" class="grid grid-cols-2 border-t border-slate-100 md:contents">
        <div class="px-3 py-2 md:min-w-[8.5rem] md:flex-1 md:border-l md:border-slate-100">
          <span class="block text-xs font-medium text-rail-soft">
            {{ dateKind === 'roundtrip' ? 'Retour' : 'Au' }}
          </span>
          <input
            v-model="dateTo"
            type="date"
            data-test="date-to"
            :min="date || today"
            :max="lastBookable"
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

    <!--
      The two help texts. Stacked in the column, on a single line on the bar, where they fit
      side by side and cost 18 px instead of 63. Neither is dropped: the first is the only
      place the search mode is stated, since it is named nowhere else, and the second explains
      why the date picker stops.
    -->
    <div class="order-3 flex flex-col gap-1 px-0.5 md:order-4 md:w-full md:flex-row md:flex-wrap md:items-baseline md:gap-x-2">
      <!-- The mode is never named, so state what the search is about to do. -->
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

      <!-- The 30-day rule comes from the subscription, not the app: unsaid, a date field that
           refuses next month looks like a bug. -->
      <p class="text-[11px] leading-snug text-rail-soft/80">
        Les places à 0 € ouvrent {{ BOOKING_WINDOW_DAYS }} jours avant le départ : réservable
        jusqu'au {{ humanDate(lastBookable) }}.
      </p>
    </div>

    <p v-if="error" class="order-4 px-0.5 text-sm text-red-600 md:order-5 md:w-full">{{ error }}</p>

    <!-- Disabled on two identical stations. `submit` still validates: Enter submits the form
         even when its button is disabled. -->
    <button
      type="submit"
      :disabled="loading || sameStation"
      :class="[
        'order-5 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white transition md:order-3 md:w-auto md:shrink-0',
        // Greyed out on invalid input, but still accent while loading: a running search
        // is not an error.
        sameStation ? 'cursor-not-allowed bg-slate-300' : 'bg-accent hover:bg-accent-strong disabled:opacity-70',
      ]"
    >
      <Spinner v-if="loading" :size="16" />
      <span>{{ loading ? 'Recherche…' : submitLabel }}</span>
    </button>
  </form>
</template>
