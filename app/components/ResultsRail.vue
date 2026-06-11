<script setup lang="ts">
import type { SearchResult, ReturnDatesResult } from '~~/shared/types'

defineProps<{
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
</script>

<template>
  <div class="flex h-full flex-col gap-2">
    <div v-if="pending" class="p-4 text-rail-soft">Recherche des destinations…</div>

    <div v-else-if="error" class="p-4">
      <p class="text-red-600">Impossible de récupérer les données SNCF.</p>
      <button class="mt-2 rounded-md bg-rail px-3 py-1.5 text-sm text-white" @click="emit('retry')">
        Réessayer
      </button>
    </div>

    <template v-else-if="result">
      <p class="px-1 text-sm text-rail-soft">
        <strong class="text-rail">{{ result.origin.label }}</strong> ·
        {{ result.destinations.length }} destination(s)
      </p>
      <ul v-if="result.destinations.length" class="flex flex-col gap-2 overflow-auto pr-1">
        <DestinationCard
          v-for="d in result.destinations"
          :key="d.label"
          :destination="d"
          :returns="returns[d.label] ?? null"
          :returns-loading="returnsLoading === d.label"
          @show-returns="emit('show-returns', $event)"
          @hover="emit('hover', $event)"
        />
      </ul>
      <p v-else class="p-4 text-rail-soft">Aucune destination TGVmax réservable ce jour-là.</p>
    </template>

    <div v-else class="p-4 text-rail-soft">
      Choisissez une gare et une date pour voir les destinations TGVmax disponibles.
    </div>
  </div>
</template>
