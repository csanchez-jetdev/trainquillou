<script setup lang="ts">
import type { RouteResult } from '~~/shared/types'

const props = defineProps<{
  route: (RouteResult & { truncated?: boolean }) | null | undefined
  pending: boolean
  error: unknown
  selected: number
}>()
const emit = defineEmits<{ select: [number]; retry: [] }>()

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}
</script>

<template>
  <div class="flex h-full flex-col gap-2">
    <div v-if="pending" class="p-4 text-rail-soft">Recherche d'itinéraires…</div>

    <div v-else-if="error" class="p-4">
      <p class="text-red-600">Impossible de calculer l'itinéraire.</p>
      <button class="mt-2 rounded-md bg-rail px-3 py-1.5 text-sm text-white" @click="emit('retry')">
        Réessayer
      </button>
    </div>

    <template v-else-if="route">
      <p class="px-1 text-sm text-rail-soft">
        <strong class="text-rail">{{ route.from.label }}</strong> →
        <strong class="text-rail">{{ route.to.label }}</strong> ·
        {{ route.itineraries.length }} itinéraire(s)
      </p>
      <p v-if="route.truncated" class="px-1 text-[11px] text-amber-600">
        Exploration partielle (budget d'appels atteint) : d'autres trajets à 2 correspondances peuvent exister.
      </p>

      <ul v-if="route.itineraries.length" class="flex flex-col gap-2 overflow-auto pr-1">
        <li
          v-for="(it, i) in route.itineraries"
          :key="i"
          :data-test="'itinerary'"
          :class="[
            'cursor-pointer rounded-xl border p-3 transition',
            i === selected ? 'border-accent bg-accent/5 shadow-md' : 'border-slate-200 bg-white hover:border-accent',
          ]"
          @mouseenter="emit('select', i)"
          @click="emit('select', i)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold text-rail">{{ it.departure }} → {{ it.arrival }}</span>
            <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-rail-soft">
              {{ it.stops === 0 ? 'Direct' : `${it.stops} corresp.` }} · {{ fmtDuration(it.durationMin) }}
            </span>
          </div>
          <ol class="mt-2 space-y-1">
            <li
              v-for="(l, j) in it.legs"
              :key="j"
              class="flex items-baseline gap-2 text-sm text-rail-soft"
            >
              <span class="tabular-nums text-rail">{{ l.departure }}</span>
              <span class="truncate">{{ l.from }}</span>
              <span class="text-slate-300">→</span>
              <span class="tabular-nums text-rail">{{ l.arrival }}</span>
              <span class="truncate">{{ l.to }}</span>
            </li>
          </ol>
        </li>
      </ul>
      <p v-else class="p-4 text-rail-soft">
        Aucun itinéraire TGVmax trouvé ce jour-là. Essayez d'augmenter le nombre de correspondances ou de changer de date.
      </p>
    </template>

    <div v-else class="p-4 text-rail-soft">
      Choisissez une gare de départ, une gare d'arrivée et une date pour composer un trajet TGVmax.
    </div>
  </div>
</template>
