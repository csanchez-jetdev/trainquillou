<script setup lang="ts">
import type { SearchResult, ReturnDatesResult } from '~~/shared/types'

const props = defineProps<{
  result: SearchResult | null | undefined
  pending: boolean
  error: unknown
  returns: Record<string, ReturnDatesResult>
  returnsLoading: string | null
}>()
const emit = defineEmits<{
  'show-returns': [string]
  hover: [string | null]
  retry: []
}>()

const sortBy = ref<'default' | 'popularity'>('default')

const sortedDestinations = computed(() => {
  const list = props.result?.destinations ?? []
  if (sortBy.value !== 'popularity') return list
  return [...list].sort((a, b) => (b.popularity ?? -1) - (a.popularity ?? -1) || a.label.localeCompare(b.label))
})
</script>

<template>
  <div class="flex h-full flex-col gap-2">
    <LoadingCards v-if="pending" label="Recherche des destinations…" />

    <div v-else-if="error" class="p-4">
      <p class="text-red-600">Impossible de récupérer les données SNCF.</p>
      <button class="mt-2 rounded-md bg-rail px-3 py-1.5 text-sm text-white" @click="emit('retry')">
        Réessayer
      </button>
    </div>

    <template v-else-if="result">
      <p class="px-1 text-sm text-rail-soft">
        <template v-if="result.mode === 'to'">
          Vers <strong class="text-rail">{{ result.origin.label }}</strong> ·
          {{ result.destinations.length }} origine(s) possible(s)
        </template>
        <template v-else-if="result.mode === 'range'">
          Depuis <strong class="text-rail">{{ result.origin.label }}</strong> ·
          {{ result.destinations.length }} destination(s) sur la plage
        </template>
        <template v-else-if="result.mode === 'roundtrip'">
          Depuis <strong class="text-rail">{{ result.origin.label }}</strong> ·
          {{ result.destinations.length }} escapade(s) avec aller <em>et</em> retour réservables
        </template>
        <template v-else>
          <strong class="text-rail">{{ result.origin.label }}</strong> ·
          {{ result.destinations.length }} destination(s)
        </template>
      </p>
      <div v-if="result.destinations.length" class="flex items-center justify-end gap-1 px-1 text-xs text-rail-soft">
        <span>Trier :</span>
        <button
          type="button"
          :class="sortBy === 'default' ? 'font-semibold text-accent-strong' : 'hover:text-rail'"
          @click="sortBy = 'default'"
        >
          {{ result.mode === 'range' ? 'jours' : 'A→Z' }}
        </button>
        <span class="text-slate-300">·</span>
        <button
          type="button"
          data-test="sort-popularity"
          :class="sortBy === 'popularity' ? 'font-semibold text-accent-strong' : 'hover:text-rail'"
          @click="sortBy = 'popularity'"
        >
          notoriété ★
        </button>
      </div>
      <ul v-if="result.destinations.length" class="flex flex-col gap-2 overflow-auto pr-1">
        <DestinationCard
          v-for="d in sortedDestinations"
          :key="d.label"
          :destination="d"
          :mode="result.mode"
          :origin-slug="result.origin.slug"
          :returns="returns[d.label] ?? null"
          :returns-loading="returnsLoading === d.label"
          @show-returns="emit('show-returns', $event)"
          @hover="emit('hover', $event)"
        />
      </ul>
      <p v-else class="p-4 text-rail-soft">
        <template v-if="result.mode === 'to'">
          Aucune origine TGVmax vers cette gare ce jour-là.
        </template>
        <template v-else-if="result.mode === 'roundtrip'">
          Aucune destination n'a l'aller <em>et</em> le retour réservables à ces dates.
          Essayez de décaler le retour d'un jour.
        </template>
        <template v-else>
          Aucune destination TGVmax réservable sur cette période.
        </template>
      </p>
    </template>

    <div v-else class="p-4 text-rail-soft">
      Choisissez une gare et une date pour voir les destinations TGVmax disponibles.
    </div>
  </div>
</template>
