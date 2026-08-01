<script setup lang="ts">
import type { Destination, SearchMode } from '~~/shared/types'
import { prettyLabel } from '~~/shared/stations'

/** One result row: enough to *pick* a city, not to study it. A search commonly returns
 *  70 to 130 of them, so the detail lives in the map popover. */
const props = defineProps<{
  destination: Destination
  mode: SearchMode
  selected?: boolean
}>()
const emit = defineEmits<{ select: [string]; hover: [string | null] }>()

const pop = computed(() => popularityTier(props.destination.popularity))
const name = computed(() => prettyLabel(props.destination.label))

const trains = computed(() => props.destination.trains ?? [])
const fastest = computed(() => fastestTrip(trains.value))
const window = computed(() => departureWindow(trains.value))
const days = computed(() => props.destination.availableDates ?? [])

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric',
  })
}
</script>

<template>
  <li>
    <button
      type="button"
      data-test="dest-card"
      :aria-pressed="selected"
      :class="[
        'relative w-full px-3 py-2.5 text-left transition',
        selected ? 'bg-accent/[.07]' : 'hover:bg-slate-50',
      ]"
      @click="emit('select', destination.label)"
      @mouseenter="emit('hover', destination.label)"
      @mouseleave="emit('hover', null)"
      @focus="emit('hover', destination.label)"
      @blur="emit('hover', null)"
    >
      <!-- An accent bar rather than an outline: readable out of the corner of the eye
           while scrolling, without a box around every row. -->
      <span v-if="selected" class="absolute inset-y-0 left-0 w-[3px] bg-accent" />

      <div class="flex items-baseline gap-2">
        <span class="min-w-0 flex-1 truncate font-semibold text-rail">{{ name }}</span>
        <span v-if="pop.tier > 0" :title="pop.label" class="shrink-0 text-[10px] text-amber-400">
          {{ pop.stars }}
        </span>
        <!-- Navy, not teal: the accent colour is reserved for interactive state. -->
        <span
          v-if="fastest"
          data-test="card-duration"
          class="shrink-0 text-sm font-bold tabular-nums text-rail"
        >
          {{ formatDuration(tripDurationMin(fastest)) }}
        </span>
        <span
          v-else-if="mode === 'range'"
          class="shrink-0 text-sm font-bold tabular-nums text-rail"
        >
          {{ days.length }} j
        </span>
      </div>

      <p class="mt-0.5 truncate text-xs text-rail-soft">
        <template v-if="mode === 'range'">
          {{ days.slice(0, 4).map(formatDate).join(' · ') }}<template v-if="days.length > 4"> +{{ days.length - 4 }}</template>
        </template>
        <template v-else-if="mode === 'roundtrip'">
          {{ trains.length }} aller<template v-if="trains.length > 1">s</template>
          <span class="text-slate-300"> · </span>
          <span class="text-coral-strong">{{ destination.returnTrains?.length ?? 0 }} retour<template v-if="(destination.returnTrains?.length ?? 0) > 1">s</template></span>
        </template>
        <template v-else>
          {{ trains.length }} train<template v-if="trains.length > 1">s</template>
          <template v-if="window">
            <span class="text-slate-300"> · </span>
            <span class="tabular-nums">{{ window.first }}<template v-if="window.last !== window.first"> → {{ window.last }}</template></span>
          </template>
        </template>
      </p>
    </button>
  </li>
</template>
