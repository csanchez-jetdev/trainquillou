<script setup lang="ts">
export interface Bar {
  key: string
  label: string
  value: number
  display: string
  full?: string
  color?: string
}

const props = withDefaults(
  defineProps<{
    title: string
    unit: string
    bars: Bar[]
    orientation?: 'columns' | 'bars'
    emphasis?: string
    height?: number
  }>(),
  { orientation: 'columns', emphasis: undefined, height: 176 },
)

const peak = computed(() => Math.max(...props.bars.map((bar) => bar.value), 1))

// Two percent floor: a bar that rounds to nothing reads as missing data.
function extent(value: number) {
  return `${Math.max(2, (value / peak.value) * 100)}%`
}

function fill(bar: Bar) {
  if (bar.color) return `var(${bar.color})`
  return bar.key === props.emphasis ? 'var(--color-q4)' : 'var(--color-q2)'
}
</script>

<template>
  <figure class="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
    <figcaption class="text-sm font-medium text-rail">{{ title }}</figcaption>

    <ol v-if="orientation === 'columns'" class="mt-5 flex justify-between gap-[2px]">
      <li
        v-for="bar in bars"
        :key="bar.key"
        class="group flex max-w-6 flex-1 flex-col items-center"
      >
        <span class="relative flex w-full flex-col justify-end" :style="{ height: `${height}px` }">
          <span class="sr-only">{{ bar.full ?? bar.label }} : {{ bar.display }}</span>
          <span
            class="w-full rounded-t-[4px] transition-opacity group-hover:opacity-80"
            :style="{ height: extent(bar.value), background: fill(bar) }"
          />
          <span
            aria-hidden="true"
            class="pointer-events-none absolute -top-8 left-1/2 z-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-rail px-2 py-1 text-xs font-medium text-white group-hover:block"
          >
            {{ bar.full ?? bar.label }} · {{ bar.display }}
          </span>
        </span>
        <span
          v-if="bars.length <= 8"
          class="mt-2 whitespace-nowrap text-[11px] text-rail-soft"
        >{{ bar.label }}</span>
      </li>
    </ol>

    <ul v-else class="mt-5 space-y-2">
      <li v-for="bar in bars" :key="bar.key" class="grid grid-cols-[7.5rem_1fr] items-center gap-3 sm:grid-cols-[11rem_1fr]">
        <span class="truncate text-sm text-rail-soft" :title="bar.full ?? bar.label">{{ bar.label }}</span>
        <span class="flex items-center gap-2">
          <span
            class="h-4 rounded-r-[4px]"
            :style="{ width: extent(bar.value), background: fill(bar) }"
          />
          <span class="shrink-0 text-sm font-medium tabular-nums text-rail">{{ bar.display }}</span>
        </span>
      </li>
    </ul>

    <!-- Past eight columns the per-column labels collide, so only the two ends are named. -->
    <div
      v-if="orientation === 'columns' && bars.length > 8"
      class="mt-2 flex justify-between text-xs tabular-nums text-rail-soft"
    >
      <span>{{ bars[0]?.label }}</span>
      <span>{{ bars.at(-1)?.label }}</span>
    </div>

    <details class="group mt-4">
      <summary class="cursor-pointer list-none text-xs font-medium text-accent-strong hover:underline">
        Voir les données
        <span class="text-rail-soft group-open:hidden">({{ bars.length }} valeurs)</span>
      </summary>
      <div class="mt-2 max-h-64 overflow-y-auto">
        <table class="w-full text-left text-xs">
          <thead class="text-rail-soft">
            <tr>
              <th scope="col" class="py-1 pr-3 font-medium">{{ title }}</th>
              <th scope="col" class="py-1 text-right font-medium">{{ unit }}</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="bar in bars" :key="bar.key">
              <td class="py-1 pr-3">{{ bar.full ?? bar.label }}</td>
              <td class="py-1 text-right tabular-nums">{{ bar.display }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </figure>
</template>
