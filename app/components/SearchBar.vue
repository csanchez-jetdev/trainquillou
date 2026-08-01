<script setup lang="ts">
import type { SearchMode } from '~~/shared/types'

type BarMode = SearchMode | 'route'
/** Comment les dates sont choisies. Le mode de recherche en découle, il n'est plus choisi. */
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

/**
 * Les cinq modes de recherche ne sont pas cinq choix à faire, mais la conséquence de trois
 * champs : quelle gare de départ, quelle gare d'arrivée (vide = n'importe où), et comment
 * les dates sont choisies. On saisit une intention, l'application en déduit le mode.
 */
const from = ref('')
const to = ref('')
const dateKind = ref<DateKind>('single')
const date = ref(props.initialDate ?? '')
const dateTo = ref(props.initialDateTo ?? '')
const stops = ref(props.initialStops ?? '2')
const error = ref('')

// L'URL reste la source de vérité et porte toujours `mode` : on rétablit l'état des champs
// qui produit ce mode, pour qu'un lien partagé ou la page d'accueil ouvrent le bon écran.
{
  const m = props.initialMode ?? 'from'
  if (m === 'to') to.value = props.initialOrigin ?? ''
  else from.value = props.initialOrigin ?? ''
  if (m === 'route') to.value = props.initialDestination ?? ''
  if (m === 'roundtrip') dateKind.value = 'roundtrip'
  if (m === 'range') dateKind.value = 'range'
}

const today = new Date().toISOString().slice(0, 10)

const hasFrom = computed(() => Boolean(from.value.trim()))
const hasTo = computed(() => Boolean(to.value.trim()))

/**
 * Intention reçue de l'URL (`/app?mode=to`), tant qu'aucune gare n'est saisie : un
 * formulaire vide ne peut pas exprimer à lui seul « je cherche à l'envers ». Dès que
 * l'on saisit quelque chose, ce sont les champs qui décident.
 */
const pendingMode = ref<BarMode | null>(
  props.initialMode === 'to' || props.initialMode === 'route' ? props.initialMode : null,
)
watch([from, to], () => (pendingMode.value = null))

/** Aller-retour et plage n'ont de sens que sans gare d'arrivée fixée. */
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
  // Formulaire vide et sans intention particulière : c'est le moment d'annoncer que la
  // gare d'arrivée est facultative, et ce que ça change de la laisser vide.
  if (!hasFrom.value && !hasTo.value && mode.value === 'from') {
    return 'Indiquez une gare de départ — ou seulement une gare d\'arrivée pour chercher à l\'envers.'
  }
  return HINTS[mode.value]
})

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
  }
  error.value = ''
  emit('search', {
    // En recherche inversée, la gare cherchée est celle d'arrivée : c'est elle le pivot.
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
  <form class="w-full" @submit.prevent="submit">
    <!-- Les deux gares, avec inversion du sens -->
    <div class="flex gap-2">
      <div class="flex-1 space-y-2">
        <StationInput
          v-model="from"
          label="Depuis"
          placeholder="Paris, Lyon, Nantes…"
          test-id="input-from"
        />
        <StationInput
          v-model="to"
          label="Vers"
          placeholder="N'importe où"
          test-id="input-to"
        />
      </div>
      <div class="flex shrink-0 items-center">
        <button
          type="button"
          data-test="swap"
          title="Inverser le sens"
          aria-label="Inverser le sens de la recherche"
          class="grid h-9 w-9 place-items-center rounded-full border border-slate-200 bg-white text-rail-soft transition hover:border-accent hover:text-accent-strong"
          @click="swap"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Quand : une date, et la façon de l'interpréter -->
    <div class="mt-3 flex gap-2">
      <div class="flex-1">
        <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-rail-soft">
          {{ firstDateLabel }}
        </label>
        <input
          v-model="date"
          type="date"
          :min="today"
          class="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
        >
      </div>
      <div class="flex-1">
        <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-rail-soft">
          Voyage
        </label>
        <select
          v-model="dateKind"
          data-test="date-kind"
          class="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:bg-slate-50 disabled:text-rail-soft"
          :disabled="!canPickDateKind"
        >
          <option value="single">Aller simple</option>
          <option value="roundtrip">Aller-retour</option>
          <option value="range">Plusieurs jours</option>
        </select>
      </div>
    </div>

    <div v-if="hasSecondDate || mode === 'route'" class="mt-3 flex gap-2">
      <div v-if="hasSecondDate" class="flex-1">
        <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-rail-soft">
          {{ dateKind === 'roundtrip' ? 'Retour' : 'Au' }}
        </label>
        <input
          v-model="dateTo"
          type="date"
          data-test="date-to"
          :min="date || today"
          class="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
        >
      </div>
      <div v-if="mode === 'route'" class="flex-1">
        <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-rail-soft">
          Correspondances
        </label>
        <select
          v-model="stops"
          data-test="stops-select"
          class="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
        >
          <option value="0">Direct</option>
          <option value="1">≤ 1</option>
          <option value="2">≤ 2</option>
          <option value="3">≤ 3 (plus lent)</option>
        </select>
      </div>
    </div>

    <!-- Ce que la recherche va faire, en clair : le mode n'est plus nommé, il doit être dit. -->
    <p data-test="search-hint" class="mt-2.5 text-xs leading-snug text-rail-soft">
      {{ hint }}
    </p>

    <p v-if="error" class="mt-2 text-sm text-red-600">{{ error }}</p>

    <button
      type="submit"
      :disabled="loading"
      class="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-accent to-accent-strong px-4 py-2.5 font-semibold text-white shadow-sm shadow-accent/30 transition hover:shadow-md hover:brightness-105 disabled:opacity-70"
    >
      <Spinner v-if="loading" :size="16" />
      <span>{{ loading ? 'Recherche…' : submitLabel }}</span>
    </button>
  </form>
</template>
