<script setup lang="ts">
const props = defineProps<{ initialOrigin?: string; initialDate?: string }>()
const emit = defineEmits<{ search: [{ origin: string; date: string }] }>()

const { suggest } = useStations()

const origin = ref(props.initialOrigin ?? '')
const date = ref(props.initialDate ?? '')
const error = ref('')
const showSuggestions = ref(false)
const suggestions = computed(() => suggest(origin.value))
const today = new Date().toISOString().slice(0, 10)

function pick(label: string) {
  origin.value = label
  showSuggestions.value = false
}

function onBlur() {
  setTimeout(() => (showSuggestions.value = false), 120)
}

function submit() {
  if (!origin.value.trim()) {
    error.value = 'Choisissez une gare de départ.'
    return
  }
  if (!date.value) {
    error.value = 'Choisissez une date.'
    return
  }
  error.value = ''
  emit('search', { origin: origin.value.trim(), date: date.value })
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

    <div class="relative">
      <label class="block text-xs font-semibold uppercase tracking-wide text-rail-soft">Gare de départ</label>
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

    <div class="mt-3">
      <label class="block text-xs font-semibold uppercase tracking-wide text-rail-soft">Date</label>
      <input
        v-model="date"
        type="date"
        :min="today"
        class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      >
    </div>

    <p v-if="error" class="mt-2 text-sm text-red-600">{{ error }}</p>

    <button
      type="submit"
      class="mt-4 w-full rounded-lg bg-accent px-4 py-2.5 font-semibold text-white transition hover:bg-accent-strong"
    >
      Voir les destinations
    </button>
  </form>
</template>
