<script setup lang="ts">
import type { Destination, ReturnDatesResult, SearchMode } from '~~/shared/types'

const props = defineProps<{
  destination: Destination
  mode: SearchMode
  /** Slug de réservation du hub, pour construire les liens vers les revendeurs. */
  originSlug?: string
  returns?: ReturnDatesResult | null
  returnsLoading?: boolean
}>()
const emit = defineEmits<{ 'show-returns': [string]; hover: [string | null] }>()

const pop = computed(() => popularityTier(props.destination.popularity))

/** En recherche inverse, le voyage part de la gare listée et rejoint le hub. */
const legSlugs = computed(() => {
  const hub = props.originSlug
  const other = props.destination.slug
  if (!hub || !other) return null
  return props.mode === 'to' ? { from: other, to: hub } : { from: hub, to: other }
})

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
      <span class="flex min-w-0 items-center gap-1.5">
        <span class="truncate font-semibold text-rail">{{ destination.label }}</span>
        <span
          v-if="pop.tier > 0"
          :title="`${pop.label} (notoriété)`"
          class="shrink-0 text-xs text-amber-500"
        >{{ pop.stars }}</span>
      </span>
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
      <span
        v-else-if="mode === 'roundtrip'"
        class="shrink-0 rounded-full bg-coral/15 px-2 py-0.5 text-xs font-medium text-coral-strong"
      >
        aller-retour
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

    <!-- Mode aller-retour : les deux sens, séparés -->
    <div v-else-if="mode === 'roundtrip'" class="mt-2 flex flex-col gap-1.5">
      <div class="flex items-start gap-2">
        <span class="mt-0.5 w-12 shrink-0 text-xs font-semibold uppercase text-rail-soft">Aller</span>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="t in destination.trains"
            :key="`out-${t.departure}-${t.trainNumber}`"
            data-test="dep-chip"
            :title="`Arrivée ${t.arrival}${t.trainNumber ? ` · Train ${t.trainNumber}` : ''}`"
            class="rounded-md bg-slate-100 px-2 py-0.5 text-sm tabular-nums text-rail-soft"
          >
            {{ t.departure }}
          </span>
        </div>
      </div>
      <div class="flex items-start gap-2">
        <span class="mt-0.5 w-12 shrink-0 text-xs font-semibold uppercase text-coral-strong">Retour</span>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="t in destination.returnTrains"
            :key="`back-${t.departure}-${t.trainNumber}`"
            data-test="return-chip"
            :title="`Arrivée ${t.arrival}${t.trainNumber ? ` · Train ${t.trainNumber}` : ''}`"
            class="rounded-md bg-coral/10 px-2 py-0.5 text-sm tabular-nums text-coral-strong"
          >
            {{ t.departure }}
          </span>
        </div>
      </div>
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

    <!-- Réservation : Trainquillou montre où aller, la réservation se fait chez le revendeur -->
    <div v-if="legSlugs" class="mt-2 flex items-center gap-3 text-xs">
      <a
        :href="sncfConnectUrl(legSlugs.from, legSlugs.to)"
        target="_blank"
        rel="noopener"
        data-test="book-sncf"
        class="font-semibold text-accent-strong underline decoration-accent/40 hover:decoration-accent"
      >
        Réserver sur SNCF Connect
      </a>
      <a
        :href="trainlineUrl(legSlugs.from, legSlugs.to)"
        target="_blank"
        rel="noopener"
        data-test="book-trainline"
        class="text-rail-soft underline decoration-slate-300 hover:text-rail"
      >
        Trainline
      </a>
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
