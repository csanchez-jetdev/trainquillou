<script setup lang="ts">
import type { Destination, SearchMode } from '~~/shared/types'
import { prettyLabel } from '~~/shared/stations'

/**
 * Une ligne de résultat. Elle sert à *choisir* une ville, pas à l'étudier : nom, notoriété,
 * durée du trajet le plus court, amplitude des départs. Le détail (horaires, réservation,
 * dates de retour) vit dans la fiche de la carte, ouverte au clic.
 *
 * Une recherche à quatre semaines renvoie couramment 70 destinations, une exploration sur
 * une semaine en renvoie 130 : tout déplier ferait plusieurs mètres de défilement.
 */
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
        'w-full rounded-lg border px-3 py-2 text-left transition',
        selected
          ? 'border-accent bg-accent/5 ring-1 ring-accent/40'
          : 'border-slate-200 bg-white hover:border-accent/60 hover:bg-slate-50',
      ]"
      @click="emit('select', destination.label)"
      @mouseenter="emit('hover', destination.label)"
      @mouseleave="emit('hover', null)"
      @focus="emit('hover', destination.label)"
      @blur="emit('hover', null)"
    >
      <div class="flex items-baseline gap-2">
        <span class="min-w-0 flex-1 truncate font-semibold text-rail">{{ name }}</span>
        <span v-if="pop.tier > 0" :title="pop.label" class="shrink-0 text-[11px] text-amber-500">
          {{ pop.stars }}
        </span>
        <!-- Le chiffre sur lequel on tranche vraiment : Lyon et Perpignan se ressemblent
             dans une liste, 1h56 et 5h07 ne se ressemblent pas. -->
        <span
          v-if="fastest"
          data-test="card-duration"
          class="shrink-0 text-sm font-semibold tabular-nums text-accent-strong"
        >
          {{ formatDuration(tripDurationMin(fastest)) }}
        </span>
        <span
          v-else-if="mode === 'range'"
          class="shrink-0 rounded-full bg-accent/10 px-1.5 text-[11px] font-semibold text-accent-strong"
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
