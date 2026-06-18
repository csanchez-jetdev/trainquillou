<script setup lang="ts">
import type { SearchMode } from '~~/shared/types'

const props = defineProps<{
  initialOrigin?: string
  initialDate?: string
  initialDateTo?: string
  initialMode?: SearchMode
}>()
const emit = defineEmits<{
  search: [{ origin: string; date: string; dateTo?: string; mode: SearchMode }]
}>()

const { suggest } = useStations()

const mode = ref<SearchMode>(props.initialMode ?? 'from')
const origin = ref(props.initialOrigin ?? '')
const date = ref(props.initialDate ?? '')
const dateTo = ref(props.initialDateTo ?? '')
const error = ref('')
const showSuggestions = ref(false)
const suggestions = computed(() => suggest(origin.value))
const today = new Date().toISOString().slice(0, 10)

const MODES: Array<{ key: SearchMode; label: string }> = [
  { key: 'from', label: 'Depuis' },
  { key: 'to', label: 'Vers' },
  { key: 'range', label: 'Plusieurs jours' },
]

const stationLabel = computed(() => (mode.value === 'to' ? "Gare d'arrivée" : 'Gare de départ'))
const submitLabel = computed(() =>
  mode.value === 'to' ? "D'où peut-on venir ?" : 'Voir les destinations',
)

function pick(label: string) {
  origin.value = label
  showSuggestions.value = false
}

function onBlur() {
  setTimeout(() => (showSuggestions.value = false), 120)
}

function submit() {
  if (!origin.value.trim()) {
    error.value = mode.value === 'to' ? "Choisissez une gare d'arrivée." : 'Choisissez une gare de départ.'
    return
  }
  if (!date.value) {
    error.value = 'Choisissez une date.'
    return
  }
  if (mode.value === 'range') {
    if (!dateTo.value) {
      error.value = 'Choisissez une date de fin.'
      return
    }
    if (dateTo.value < date.value) {
      error.value = 'La date de fin doit suivre la date de début.'
      return
    }
  }
  error.value = ''
  emit('search', {
    origin: origin.value.trim(),
    date: date.value,
    dateTo: mode.value === 'range' ? dateTo.value : undefined,
    mode: mode.value,
  })
}
</script>

<template>
  <form
    class="w-full rounded-2xl bg-white/95 p-4 shadow-xl ring-1 ring-black/5 backdrop-blur"
    @submit.prevent="submit"
  >
    <p class="mb-3 rounded-full bg-rail px-3 py-1 text-center text-xs font-medium text-white/90">
      100% gratuit · sans paywall · sans compte
    </p>

    <!-- Sélecteur de mode -->
    <div class="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1">
      <button
        v-for="m in MODES"
        :key="m.key"
        type="button"
        :data-test="`mode-${m.key}`"
        :class="[
          'flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition',
          mode === m.key ? 'bg-white text-accent-strong shadow-sm' : 'text-rail-soft hover:text-rail',
        ]"
        @click="mode = m.key"
      >
        {{ m.label }}
      </button>
    </div>

    <div class="relative">
      <label class="block text-xs font-semibold uppercase tracking-wide text-rail-soft">{{ stationLabel }}</label>
      <input
        v-model="origin"
        type="text"
        placeholder="Paris, Lyon, Nantes…"
        autocomplete="off"
        role="combobox"
        :aria-expanded="showSuggestions"
        class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        @focus="showSuggestions = true"
        @input="showSuggestions = true"
        @blur="onBlur"
      >
      <ul
        v-if="showSuggestions && suggestions.length"
        role="listbox"
        class="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
      >
        <li
          v-for="s in suggestions"
          :key="s"
          role="option"
          class="cursor-pointer px-3 py-2 hover:bg-accent/10"
          @mousedown.prevent="pick(s)"
        >
          {{ s }}
        </li>
      </ul>
    </div>

    <div class="mt-3 flex gap-2">
      <div class="flex-1">
        <label class="block text-xs font-semibold uppercase tracking-wide text-rail-soft">
          {{ mode === 'range' ? 'Du' : 'Date' }}
        </label>
        <input
          v-model="date"
          type="date"
          :min="today"
          class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        >
      </div>
      <div v-if="mode === 'range'" class="flex-1">
        <label class="block text-xs font-semibold uppercase tracking-wide text-rail-soft">Au</label>
        <input
          v-model="dateTo"
          type="date"
          :min="date || today"
          class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
        >
      </div>
    </div>

    <p v-if="error" class="mt-2 text-sm text-red-600">{{ error }}</p>

    <button
      type="submit"
      class="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-white transition hover:bg-accent-strong"
    >
      {{ submitLabel }}
    </button>
  </form>
</template>
