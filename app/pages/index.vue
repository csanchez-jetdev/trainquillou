<script setup lang="ts">
import type { ReturnDatesResult } from '~~/shared/types'

const { origin, date, dateTo, mode, result, pending, error, search, refresh } = useSearch()
const { cache: returnsCache, loading: returnsLoading, load: loadReturns } = useReturns()
const hovered = ref<string | null>(null)

const returnsByDest = computed(() => {
  const map: Record<string, ReturnDatesResult> = {}
  for (const r of Object.values(returnsCache)) map[r.origin] = r
  return map
})

async function onShowReturns(destLabel: string) {
  if (!result.value) return
  await loadReturns(destLabel, result.value.origin.label, result.value.date)
}
</script>

<template>
  <main class="relative h-screen w-screen overflow-hidden bg-slate-100">
    <!-- Map background (.client.vue = client-only, no ClientOnly wrapper needed) -->
    <MapView class="absolute inset-0" :result="result" :hovered="hovered" />

    <!-- Floating left panel -->
    <div class="absolute inset-x-2 bottom-2 z-10 flex max-h-[70vh] flex-col gap-3 sm:inset-x-auto sm:left-4 sm:top-4 sm:bottom-4 sm:max-h-none sm:w-[22rem]">
      <SearchBar
        :initial-origin="origin"
        :initial-date="date"
        :initial-date-to="dateTo"
        :initial-mode="mode"
        @search="search"
      />
      <div class="min-h-0 flex-1 overflow-hidden rounded-2xl bg-white/95 p-3 shadow-xl ring-1 ring-black/5 backdrop-blur">
        <ResultsRail
          :result="result"
          :pending="pending"
          :error="error"
          :returns="returnsByDest"
          :returns-loading="returnsLoading"
          @show-returns="onShowReturns"
          @hover="hovered = $event"
          @retry="refresh"
        />
      </div>
      <p class="px-1 text-[11px] text-rail-soft/80">
        Données <a class="underline" href="https://data.sncf.com/explore/dataset/tgvmax/" target="_blank" rel="noopener">open data SNCF</a> ·
        carte © OpenStreetMap, MapLibre
      </p>
    </div>
  </main>
</template>
