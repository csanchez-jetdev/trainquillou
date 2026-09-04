<script setup lang="ts">
const props = defineProps<{
  label: string
  share: string
  eligible: string
  total: string
  /** `[lat, lon]`, like everywhere else in the API. */
  stations: [number, number][]
  backdrop: [number, number][]
}>()

const [WIDTH, HEIGHT] = [104, 104]

// Longitudes narrowed by the cosine of the middle latitude, or France comes out visibly wide.
const project = computed(() => {
  const points = props.backdrop.length ? props.backdrop : props.stations
  const lats = points.map(([lat]) => lat)
  const lons = points.map(([, lon]) => lon)
  const [south, north] = [Math.min(...lats), Math.max(...lats)]
  const [west, east] = [Math.min(...lons), Math.max(...lons)]
  const squash = Math.cos((((south + north) / 2) * Math.PI) / 180)

  const spanX = Math.max((east - west) * squash, 1e-6)
  const spanY = Math.max(north - south, 1e-6)
  const scale = Math.min((WIDTH - 8) / spanX, (HEIGHT - 8) / spanY)
  const padX = (WIDTH - spanX * scale) / 2
  const padY = (HEIGHT - spanY * scale) / 2

  return ([lat, lon]: [number, number]) => ({
    x: padX + (lon - west) * squash * scale,
    // SVG y grows downward, latitude grows north.
    y: padY + (north - lat) * scale,
  })
})

const dots = computed(() => props.backdrop.map(project.value))
const highlighted = computed(() => props.stations.map(project.value))
</script>

<template>
  <div class="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4">
    <svg
      v-if="stations.length && backdrop.length"
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      class="h-24 w-24 shrink-0"
      role="img"
      :aria-label="`${stations.length} gares au départ sur l'axe ${label}`"
    >
      <circle
        v-for="(dot, index) in dots"
        :key="`bg-${index}`"
        :cx="dot.x"
        :cy="dot.y"
        r="1.4"
        fill="#e2e8f0"
      />
      <circle
        v-for="(dot, index) in highlighted"
        :key="`on-${index}`"
        :cx="dot.x"
        :cy="dot.y"
        r="2.1"
        fill="var(--color-coral)"
        fill-opacity="0.85"
      />
    </svg>

    <div class="min-w-0">
      <p class="truncate font-semibold text-rail">{{ label }}</p>
      <p class="text-xs text-rail-soft">éligibles TGVmax</p>
      <p class="mt-1 text-3xl font-bold leading-none tracking-tight">{{ share }}</p>
      <p class="mt-1.5 text-xs text-rail-soft">
        {{ eligible }} sur {{ total }}
        <template v-if="stations.length">· {{ stations.length }} gares au départ</template>
      </p>
    </div>
  </div>
</template>
