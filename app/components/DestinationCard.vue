<script setup lang="ts">
import type { Destination, ReturnDatesResult, SearchMode } from '~~/shared/types'

const props = defineProps<{
  destination: Destination
  mode: SearchMode
  returns?: ReturnDatesResult | null
  returnsLoading?: boolean
}>()
const emit = defineEmits<{ 'show-returns': [string]; hover: [string | null] }>()

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}
</script>

<template>
  <li
    class="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-accent hover:shadow-md"
    @mouseenter="emit('hover', destination.label)"
    @mouseleave="emit('hover', null)"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="font-semibold text-rail">{{ destination.label }}</span>
      <!-- Retours pertinents uniquement en recherche aller classique -->
      <button
        v-if="mode === 'from'"
        data-test="returns-btn"
        type="button"
        class="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-accent-strong hover:bg-accent/10"
        @click="emit('show-returns', destination.label)"
      >
        Retours →
      </button>
      <span
        v-else-if="mode === 'range' && destination.availableDates"
        class="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent-strong"
      >
        {{ destination.availableDates.length }} jour(s)
      </span>
    </div>

    <!-- Mode range : jours de disponibilité -->
    <div v-if="mode === 'range' && destination.availableDates" class="mt-2 flex flex-wrap gap-1.5">
      <span
        v-for="d in destination.availableDates"
        :key="d"
        class="rounded-md bg-slate-100 px-2 py-0.5 text-sm text-rail-soft"
      >
        {{ formatDate(d) }}
      </span>
    </div>

    <!-- Modes from / to : créneaux de train -->
    <div v-else class="mt-2 flex flex-wrap gap-1.5">
      <span
        v-for="t in destination.trains"
        :key="t.departure + t.trainNumber"
        data-test="dep-chip"
        :title="`${mode === 'to' ? 'Départ' : 'Arrivée'} ${t.arrival}${t.trainNumber ? ` · Train ${t.trainNumber}` : ''}`"
        class="rounded-md bg-slate-100 px-2 py-0.5 text-sm tabular-nums text-rail-soft"
      >
        {{ t.departure }}
      </span>
    </div>

    <p v-if="returnsLoading" class="mt-2 text-sm text-rail-soft">Chargement des retours…</p>
    <div v-else-if="returns" class="mt-2 border-t border-slate-100 pt-2">
      <p v-if="!returns.dates.length" class="text-sm text-rail-soft">Aucun retour TGVmax disponible.</p>
      <div v-else class="flex flex-wrap gap-1.5">
        <span
          v-for="d in returns.dates"
          :key="d"
          class="rounded-md bg-accent/10 px-2 py-0.5 text-sm text-accent-strong"
        >
          {{ formatDate(d) }}
        </span>
      </div>
    </div>
  </li>
</template>
