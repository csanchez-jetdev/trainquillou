<script setup lang="ts">
/**
 * Champ gare avec autocomplétion. Extrait de SearchBar parce que le formulaire en porte
 * désormais deux (départ et arrivée) et que dupliquer la logique de suggestion invitait
 * à ce que les deux copies divergent.
 */
const props = defineProps<{
  modelValue: string
  label: string
  placeholder?: string
  testId?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const { suggest } = useStations()

const open = ref(false)
const suggestions = computed(() => suggest(props.modelValue))

function pick(label: string) {
  emit('update:modelValue', label)
  open.value = false
}

// Délai au blur pour laisser le clic sur une suggestion s'enregistrer.
function close() {
  setTimeout(() => (open.value = false), 120)
}
</script>

<template>
  <div class="relative">
    <label class="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-rail-soft">
      {{ label }}
    </label>
    <input
      :value="modelValue"
      type="text"
      :placeholder="placeholder"
      :data-test="testId"
      autocomplete="off"
      role="combobox"
      :aria-expanded="open"
      class="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none transition placeholder:text-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/30"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value); open = true"
      @focus="open = true"
      @blur="close"
    >
    <ul
      v-if="open && suggestions.length"
      role="listbox"
      class="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
    >
      <li
        v-for="s in suggestions"
        :key="s"
        role="option"
        class="cursor-pointer px-3 py-2 text-sm hover:bg-accent/10"
        @mousedown.prevent="pick(s)"
      >
        {{ s }}
      </li>
    </ul>
  </div>
</template>
