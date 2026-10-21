<script setup lang="ts">
import type { LiaisonResult } from '~~/shared/types'
import { cityName } from '~~/shared/stations'
import { formatDuration } from '~/utils/trains'
import { humanDay } from '~/utils/dates'

const props = defineProps<{
  from: string
  to: string
  liaison: LiaisonResult | null
}>()

const name = cityName
const days = computed(() => props.liaison?.days ?? [])
const next = computed(() => days.value[0] ?? null)
const fastest = computed(() =>
  days.value.length ? Math.min(...days.value.map((d) => d.fastestMin)) : null,
)

/** Below ten days out of thirty, the liaison exists more on paper than in a calendar. */
const scarce = computed(() => days.value.length > 0 && days.value.length < 10)
</script>

<template>
  <div
    data-test="liaison-card"
    :class="[
      'flex flex-col gap-3 rounded-xl border p-4 transition',
      scarce ? 'border-slate-200 bg-cream' : 'border-slate-200 bg-white',
      'hover:border-accent hover:shadow-md',
    ]"
  >
    <span
      v-if="scarce"
      class="self-start rounded-md bg-coral/10 px-2 py-1 text-[10px] font-semibold tracking-wider text-coral-ink uppercase"
    >
      Peu de dates
    </span>

    <p class="font-display text-xl font-extrabold tracking-tight">
      <NuxtLink :to="`/depuis/${from}/vers/${to}`" class="text-accent-strong hover:underline">
        <span class="block text-[11px] font-medium tracking-wider text-rail-soft uppercase">
          {{ name(from) }} →
        </span>
        {{ name(to) }}
      </NuxtLink>
      <span v-if="fastest" class="ml-1.5 text-xs font-medium text-rail-soft">
        {{ formatDuration(fastest) }}
      </span>
    </p>

    <p v-if="next" class="-mt-1 text-sm">
      Prochaine date
      <b class="font-semibold text-accent-strong">
        <time :datetime="next.date">{{ humanDay(next.date, { weekday: true }) }}</time>
      </b>
    </p>
    <p v-else-if="liaison" class="-mt-1 text-sm text-rail-soft">
      Aucun direct sur les trente prochains jours.
    </p>

    <dl v-if="liaison" class="mt-auto grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
      <div>
        <dd class="font-display text-lg font-bold tabular-nums">{{ days.length }}</dd>
        <dt class="text-[10px] font-medium tracking-wider text-rail-soft uppercase">jours / 30</dt>
      </div>
      <div>
        <dd class="font-display text-lg font-bold tabular-nums">{{ next?.trains ?? 0 }}</dd>
        <dt class="text-[10px] font-medium tracking-wider text-rail-soft uppercase">
          {{ (next?.trains ?? 0) > 1 ? 'directs' : 'direct' }}
        </dt>
      </div>
      <div>
        <dd class="font-display text-lg font-bold tabular-nums">{{ liaison.returnDates.length }}</dd>
        <dt class="text-[10px] font-medium tracking-wider text-rail-soft uppercase">retour</dt>
      </div>
    </dl>
  </div>
</template>
