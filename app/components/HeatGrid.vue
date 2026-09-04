<script setup lang="ts">
export interface Cell {
  weekday: number // 1 = Monday
  hour: number
  value: number
  display: string
}

const props = withDefaults(
  defineProps<{
    title: string
    unit: string
    cells: Cell[]
    every?: number
  }>(),
  { every: 3 },
)

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

const peak = computed(() => Math.max(...props.cells.map((cell) => cell.value), 1))

const byKey = computed(() => new Map(props.cells.map((cell) => [`${cell.weekday}|${cell.hour}`, cell])))

const rows = computed(() =>
  Array.from({ length: 24 }, (_, hour) => ({
    hour,
    cells: WEEKDAYS.map((_, index) => {
      const cell = byKey.value.get(`${index + 1}|${hour}`)
      return {
        key: `${index + 1}|${hour}`,
        weekday: WEEKDAYS[index]!,
        hour,
        value: cell?.value ?? 0,
        display: cell?.display ?? '0',
      }
    }),
  })),
)

const STEPS = [
  'oklch(92% 0.055 187)',
  'oklch(76% 0.09 187)',
  'oklch(59% 0.095 187)',
  'oklch(42% 0.085 187)',
] as const

const EMPTY = '#eef2f6'

const bins = computed(() =>
  STEPS.map((color, index) => ({
    color,
    from: Math.round((index * peak.value) / STEPS.length) + 1,
    to: Math.round(((index + 1) * peak.value) / STEPS.length),
  })),
)

function tint(value: number) {
  if (!value) return EMPTY
  const index = Math.min(STEPS.length - 1, Math.floor((value / peak.value) * STEPS.length))
  return STEPS[index]
}

const listed = computed(() => [...props.cells].sort((a, b) => b.value - a.value))
</script>

<template>
  <figure class="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
    <figcaption class="text-sm font-medium text-rail">{{ title }}</figcaption>

    <div class="mt-5 grid grid-cols-[2.5rem_repeat(7,minmax(0,1fr))] gap-x-1 gap-y-[2px]">
      <span aria-hidden="true" />
      <span
        v-for="name in WEEKDAYS"
        :key="name"
        class="pb-1 text-center text-[11px] text-rail-soft"
      >{{ name.slice(0, 3) }}</span>

      <template v-for="row in rows" :key="row.hour">
        <span class="pr-1 text-right text-[10px] leading-5 tabular-nums text-rail-soft">
          {{ row.hour % every === 0 ? `${row.hour}h` : '' }}
        </span>
        <span
          v-for="cell in row.cells"
          :key="cell.key"
          tabindex="0"
          class="group relative h-5 rounded-[3px] transition-transform hover:scale-110 focus-visible:scale-110 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-rail"
          :style="{ background: tint(cell.value) }"
        >
          <span class="sr-only">{{ cell.weekday }} {{ cell.hour }}h : {{ cell.display }}</span>
          <span
            aria-hidden="true"
            class="pointer-events-none absolute -top-9 left-1/2 z-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-rail px-2 py-1 text-xs font-medium text-white group-hover:block group-focus-visible:block"
          >
            {{ cell.weekday }} {{ cell.hour }}h · {{ cell.display }}
          </span>
        </span>
      </template>
    </div>

    <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-rail-soft">
      <span class="font-medium text-rail">{{ unit }}</span>
      <span class="flex items-center gap-1.5">
        <span class="h-3 w-5 rounded-[3px]" :style="{ background: EMPTY }" />
        aucune
      </span>
      <span v-for="bin in bins" :key="bin.color" class="flex items-center gap-1.5">
        <span class="h-3 w-5 rounded-[3px]" :style="{ background: bin.color }" />
        <span class="tabular-nums">{{ bin.from }}–{{ bin.to }}</span>
      </span>
    </div>

    <details class="group mt-4">
      <summary class="cursor-pointer list-none text-xs font-medium text-accent-strong hover:underline">
        Voir les données
        <span class="text-rail-soft group-open:hidden">({{ listed.length }} créneaux)</span>
      </summary>
      <div class="mt-2 max-h-64 overflow-y-auto">
        <table class="w-full text-left text-xs">
          <thead class="text-rail-soft">
            <tr>
              <th scope="col" class="py-1 pr-3 font-medium">Créneau</th>
              <th scope="col" class="py-1 text-right font-medium">{{ unit }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="cell in listed" :key="`${cell.weekday}|${cell.hour}`">
              <td class="py-1 pr-3">{{ WEEKDAYS[cell.weekday - 1] }} {{ cell.hour }}h</td>
              <td class="py-1 text-right tabular-nums">{{ cell.display }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </figure>
</template>
