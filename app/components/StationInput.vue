<script setup lang="ts">
import { cleanString } from '~~/shared/normalize'

const props = defineProps<{
  modelValue: string
  label: string
  placeholder?: string
  testId?: string
  /** Station picked in the other field: a city to itself is not a trip. */
  exclude?: string
  /** Set when a failed submit blames this field; the message itself is shown by a toast. */
  invalid?: boolean
  describedBy?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

const { suggest } = useStations()

const id = useId()
const open = ref(false)
/** Index of the highlighted suggestion; -1 = none, the typed text stands. */
const active = ref(-1)
const suggestions = computed(() => {
  const banned = props.exclude ? cleanString(props.exclude) : ''
  const list = suggest(props.modelValue, banned ? 9 : 8)
  return (banned ? list.filter((s) => cleanString(s) !== banned) : list).slice(0, 8)
})

// Typing rebuilds the list, so the previous highlight points at another city.
watch(suggestions, () => (active.value = -1))

function pick(label: string) {
  emit('update:modelValue', label)
  open.value = false
  active.value = -1
}

// Delay on blur so a click on a suggestion has time to register.
function close() {
  setTimeout(() => (open.value = false), 120)
}

// The arrows reopen the list: after a pick the field is full and closed.
function onKeydown(event: KeyboardEvent) {
  const list = suggestions.value
  if (event.key === 'Escape') {
    open.value = false
    active.value = -1
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!open.value) { open.value = true; return }
    if (!list.length) return
    const step = event.key === 'ArrowDown' ? 1 : -1
    // One slot more than there are suggestions: cycling past either end lands on the typed text.
    const slots = list.length + 1
    active.value = ((active.value + 1 + step + slots) % slots) - 1
    return
  }
  // Enter only commits a highlighted suggestion; with none, it submits the form as usual.
  const highlighted = active.value >= 0 ? list[active.value] : undefined
  if (event.key === 'Enter' && open.value && highlighted) {
    event.preventDefault()
    pick(highlighted)
  }
}
</script>

<template>
  <div class="relative">
    <div
      class="flex items-center gap-2 rounded-[11px] px-3 py-2.5 transition focus-within:bg-accent/5"
      :class="invalid && 'tq-invalid'"
    >
      <label :for="id" class="w-12 shrink-0 text-xs font-medium text-rail-soft">{{ label }}</label>
      <input
        :id="id"
        :value="modelValue"
        type="text"
        :placeholder="placeholder"
        :data-test="testId"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-controls="`${id}-list`"
        :aria-expanded="open"
        :aria-activedescendant="active >= 0 ? `${id}-opt-${active}` : undefined"
        :aria-invalid="invalid || undefined"
        :aria-describedby="describedBy"
        class="min-w-0 flex-1 bg-transparent pr-8 text-[15px] font-medium text-rail outline-none placeholder:font-normal placeholder:text-slate-400"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value); open = true"
        @focus="open = true"
        @blur="close"
        @keydown="onKeydown"
      >
    </div>
    <ul
      v-if="open && suggestions.length"
      :id="`${id}-list`"
      role="listbox"
      class="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
    >
      <li
        v-for="(s, i) in suggestions"
        :id="`${id}-opt-${i}`"
        :key="s"
        role="option"
        :aria-selected="i === active"
        :class="[
          'cursor-pointer px-3 py-2 text-sm',
          i === active ? 'bg-accent/15 text-rail' : 'hover:bg-accent/10',
        ]"
        @mousedown.prevent="pick(s)"
        @mousemove="active = i"
      >
        {{ s }}
      </li>
    </ul>
  </div>
</template>
