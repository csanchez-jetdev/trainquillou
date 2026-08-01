<script setup lang="ts">
import { cleanString } from '~~/server/utils/normalize'

/**
 * Champ gare avec autocomplétion, conçu pour vivre *dans* un groupe bordé : il n'a ni
 * bordure ni fond propres, et son libellé est en préfixe sur la même ligne. Deux champs
 * empilés forment ainsi un objet unique — le trajet — au lieu de deux blocs juxtaposés.
 */
const props = defineProps<{
  modelValue: string
  label: string
  placeholder?: string
  testId?: string
  /** Gare déjà retenue dans l'autre champ : un trajet d'une ville vers elle-même n'existe pas. */
  exclude?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const { suggest } = useStations()

const id = useId()
const open = ref(false)
const suggestions = computed(() => {
  const banned = props.exclude ? cleanString(props.exclude) : ''
  const list = suggest(props.modelValue, banned ? 9 : 8)
  return (banned ? list.filter((s) => cleanString(s) !== banned) : list).slice(0, 8)
})

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
    <div class="flex items-center gap-2 rounded-[11px] px-3 py-2.5 transition focus-within:bg-accent/5">
      <label :for="id" class="w-12 shrink-0 text-xs font-medium text-rail-soft">{{ label }}</label>
      <input
        :id="id"
        :value="modelValue"
        type="text"
        :placeholder="placeholder"
        :data-test="testId"
        autocomplete="off"
        role="combobox"
        :aria-expanded="open"
        class="min-w-0 flex-1 bg-transparent pr-8 text-[15px] font-medium text-rail outline-none placeholder:font-normal placeholder:text-slate-400"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value); open = true"
        @focus="open = true"
        @blur="close"
      >
    </div>
    <ul
      v-if="open && suggestions.length"
      role="listbox"
      class="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
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
