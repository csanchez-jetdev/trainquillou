<script setup lang="ts">
import type { Destination, SearchMode } from '~~/shared/types'
import { prettyLabel } from '~~/shared/stations'

const props = defineProps<{
  destination: Destination
  mode: SearchMode
  selected?: boolean
  /** Wide screens open the detail right under this row; narrow ones in a sheet over the map. */
  expandable?: boolean
}>()
const emit = defineEmits<{ select: [string]; hover: [string | null] }>()

const name = computed(() => prettyLabel(props.destination.label))

const trains = computed(() => props.destination.trains ?? [])
const fastest = computed(() => fastestTrip(trains.value))
const band = computed(() => durationBand(fastest.value ? tripDurationMin(fastest.value) : null))
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
  <!-- `data-label`: how the rail finds this row to scroll it into view. -->
  <li :data-label="destination.label">
    <button
      type="button"
      data-test="dest-card"
      :aria-expanded="expandable ? Boolean(selected) : undefined"
      :aria-pressed="expandable ? undefined : selected"
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
      <span v-if="selected" class="absolute inset-y-0 left-0 w-[3px] bg-accent" />

      <div class="flex items-baseline gap-2">
        <span class="min-w-0 flex-1 truncate font-semibold text-rail">{{ name }}</span>
        <!-- Swatch, not coloured text: two of the ramp's bands fall under 4.5:1 on white. -->
        <span
          v-if="fastest"
          data-test="card-duration"
          class="inline-flex shrink-0 items-center gap-1.5 text-sm font-bold tabular-nums text-rail"
        >
          <span
            class="h-2 w-2 shrink-0 rounded-full"
            :style="{ background: `var(--color-${band?.token ?? 'accent'})` }"
          />
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
