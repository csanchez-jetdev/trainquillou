<script setup lang="ts">
// Vertices from real places: x = (lon + 4.8) / 13 * 88, y = (51.1 - lat) / 8.8 * 86 + 2.
const OUTLINE = 'M49,3 L54,7 L59,10 L71,17 L80,22 L88,23 L84,36 L74,50 L79,54 L77,63 L83,74 '
  + 'L73,80 L69,78 L63,78 L58,77 L53,84 L54,87 L43,85 L26,81 L20,78 L25,65 L25,56 L25,50 '
  + 'L18,39 L12,37 L0,32 L2,28 L14,27 L22,26 L22,16 L33,18 L40,14 L45,4 Z'

const PARIS = { x: 48, y: 24 }

const CITIES = [
  { name: 'Lille', minutes: 62, trains: 9, x: 52, y: 8 },
  { name: 'Rennes', minutes: 85, trains: 7, x: 21, y: 31 },
  { name: 'Strasbourg', minutes: 106, trains: 6, x: 85, y: 27 },
  { name: 'Nantes', minutes: 125, trains: 8, x: 22, y: 40 },
  { name: 'Bordeaux', minutes: 124, trains: 7, x: 29, y: 63 },
  { name: 'Lyon', minutes: 117, trains: 11, x: 65, y: 54 },
  { name: 'Marseille', minutes: 185, trains: 6, x: 69, y: 77 },
  { name: 'Nice', minutes: 350, trains: 3, x: 80, y: 73 },
]

const PICKED = 'Marseille'
const picked = CITIES.find((c) => c.name === PICKED)!

const rows = computed(() =>
  [...CITIES].sort((a, b) => a.minutes - b.minutes).map((c) => ({
    ...c,
    band: durationBand(c.minutes),
    duration: formatDuration(c.minutes),
  })),
)

const bandOf = (minutes: number) => durationBand(minutes)?.token ?? 'accent'

// 0 = empty form, 1 = results land, 2 = one destination picked.
const beat = ref(0)
const playing = ref(false)
const BEAT_MS = 2600
let timer: ReturnType<typeof setInterval> | null = null

function start() {
  if (timer) return
  playing.value = true
  timer = setInterval(() => (beat.value = (beat.value + 1) % 3), BEAT_MS)
}

function stop() {
  if (timer) clearInterval(timer)
  timer = null
  playing.value = false
}

onMounted(() => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    beat.value = 2
    return
  }
  start()
})
onBeforeUnmount(stop)
</script>

<template>
  <section class="mx-auto max-w-6xl px-5 pt-16 sm:px-8">
    <div class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h2 class="font-display text-2xl font-bold tracking-tight sm:text-3xl">
          Une gare, une date, une carte
        </h2>
        <p class="mt-2 max-w-2xl text-rail-soft">
          Chaque point est une ville où il reste des places à 0 €, et sa couleur dit la durée du
          trajet : du teal pour moins d'une heure trente au violet au-delà de quatre heures et
          demie. Cliquez-en un pour voir les horaires et réserver.
        </p>
      </div>
      <button
        type="button"
        data-test="preview-toggle"
        class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-rail-soft ring-1 ring-slate-200 transition hover:text-rail hover:ring-accent"
        @click="playing ? stop() : start()"
      >
        {{ playing ? '⏸ Figer l\'aperçu' : '▶ Relancer l\'aperçu' }}
      </button>
    </div>

    <div
      aria-hidden="true"
      class="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg shadow-rail/5"
    >
      <div class="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <span class="h-5 w-5 rounded-full bg-rail" />
        <span class="font-display text-sm font-bold tracking-tight text-rail">Trainquillou</span>
        <span class="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rail-soft">exemple</span>
      </div>

      <div class="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        <span class="rounded-lg px-2.5 py-1.5 text-sm font-medium ring-1 ring-slate-200">
          Paris <span class="text-rail-soft">· sam. 8 août</span>
        </span>
        <span class="rounded-lg bg-coral px-3 py-1.5 text-sm font-semibold text-white">
          Voir les destinations
        </span>
      </div>

      <div class="grid sm:grid-cols-[13rem_minmax(0,1fr)]">
        <div class="border-b border-slate-100 sm:border-b-0 sm:border-r">
          <div
            class="flex items-baseline gap-1 px-3 pt-2 text-xs text-rail-soft transition-opacity duration-500"
            :class="beat === 0 ? 'opacity-0' : 'opacity-100'"
          >
            <strong class="text-sm text-rail">{{ CITIES.length }}</strong> destinations
          </div>
          <div class="flex flex-wrap gap-1 px-3 pb-2 pt-1.5">
            <span
              v-for="b in DURATION_BANDS"
              :key="b.token"
              class="flex items-center gap-1 rounded-full border border-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-rail-soft"
            >
              <span class="h-1.5 w-1.5 rounded-full" :style="{ background: `var(--color-${b.token})` }" />
              {{ b.short }}
            </span>
          </div>
          <ul class="divide-y divide-slate-100 border-t border-slate-100">
            <li
              v-for="(r, i) in rows"
              :key="r.name"
              class="relative flex items-center gap-2 px-3 py-2 text-sm transition-opacity duration-500"
              :class="[
                beat === 0 ? 'opacity-0' : 'opacity-100',
                beat === 2 && r.name === PICKED ? 'bg-accent/[.07]' : '',
              ]"
              :style="{ transitionDelay: `${beat === 0 ? 0 : i * 70}ms` }"
            >
              <span
                v-if="beat === 2 && r.name === PICKED"
                class="absolute inset-y-0 left-0 w-[3px] bg-coral"
              />
              <span class="min-w-0 flex-1 truncate font-semibold text-rail">{{ r.name }}</span>
              <span
                class="h-2 w-2 shrink-0 rounded-full"
                :style="{ background: `var(--color-${beat === 2 && r.name === PICKED ? 'coral' : bandOf(r.minutes)})` }"
              />
              <span class="shrink-0 text-sm font-bold tabular-nums text-rail">{{ r.duration }}</span>
            </li>
          </ul>
        </div>

        <div class="flex flex-col items-center bg-cream p-3">
          <div class="relative aspect-square w-full max-w-[20rem]">
            <svg viewBox="-2 0 92 92" class="absolute inset-0 h-full w-full">
              <path :d="OUTLINE" fill="#eceee9" stroke="#dcdfd8" stroke-width="0.6" />
              <g stroke="var(--color-rail)" stroke-width="0.4" opacity="0.18">
                <line
                  v-for="c in CITIES"
                  :key="`l-${c.name}`"
                  :x1="PARIS.x"
                  :y1="PARIS.y"
                  :x2="c.x"
                  :y2="c.y"
                  class="transition-opacity duration-700"
                  :class="beat === 0 ? 'opacity-0' : 'opacity-100'"
                />
              </g>
              <circle :cx="PARIS.x" :cy="PARIS.y" r="2.6" fill="var(--color-rail)" stroke="white" stroke-width="0.9" />
              <text :x="PARIS.x + 4" :y="PARIS.y + 1.4" font-size="3.6" fill="var(--color-rail)" font-weight="600">Paris</text>
              <circle
                v-for="(c, i) in CITIES"
                :key="c.name"
                :cx="c.x"
                :cy="c.y"
                :r="beat === 2 && c.name === PICKED ? 3.4 : 2"
                :fill="`var(--color-${beat === 2 && c.name === PICKED ? 'coral' : bandOf(c.minutes)})`"
                stroke="white"
                stroke-width="0.8"
                class="transition-all duration-500"
                :class="beat === 0 ? 'opacity-0' : 'opacity-100'"
                :style="{ transitionDelay: `${beat === 0 ? 0 : i * 70}ms` }"
              />
            </svg>

          </div>

          <!-- Height reserved: without it the panel jumps as the card fades in on beat 2. -->
          <div class="mt-3 h-[4.75rem] w-full max-w-[20rem]">
            <div
              class="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-md transition-opacity duration-300"
              :class="beat === 2 ? 'opacity-100' : 'opacity-0'"
            >
              <span class="h-2.5 w-2.5 shrink-0 rounded-full bg-coral" />
              <div class="min-w-0 flex-1">
                <p class="text-sm font-bold leading-tight text-rail">{{ picked.name }}</p>
                <p class="text-[11px] text-rail-soft">
                  {{ picked.trains }} trains · dès {{ formatDuration(picked.minutes) }}
                </p>
              </div>
              <div class="flex shrink-0 gap-1">
                <span class="rounded bg-sncf px-2 py-1.5 text-[9px] font-semibold text-white">SNCF Connect</span>
                <span class="rounded bg-trainline px-2 py-1.5 text-[9px] font-semibold text-white">Trainline</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
