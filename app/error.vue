<script setup lang="ts">
import type { NuxtError } from '#app'
import { seoTitle } from '~~/shared/seo'

const { error } = defineProps<{ error: NuxtError }>()

const status = computed(() => error.statusCode ?? 500)
const notFound = computed(() => status.value === 404)

useHead({
  title: computed(() => seoTitle(notFound.value ? 'Page introuvable' : 'Erreur')),
  meta: [{ name: 'robots', content: 'noindex' }],
})
</script>

<template>
  <div class="flex min-h-[100dvh] flex-col bg-cream text-rail">
    <SiteHeader />

    <main class="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center px-5 py-14 text-center sm:px-8">
      <div class="tq-track relative" :class="{ 'tq-stalled': !notFound }">
        <svg viewBox="0 0 280 130" width="280" height="130" aria-hidden="true">
          <ellipse cx="140" cy="68" rx="116" ry="42" fill="none" stroke="#e2e8f0" stroke-width="15" />
          <ellipse cx="140" cy="68" rx="116" ry="42" fill="none" stroke="#cbd5e1" stroke-width="15" stroke-dasharray="2.5 9" />
          <ellipse cx="140" cy="68" rx="110.5" ry="36.5" fill="none" stroke="#94a3b8" stroke-width="1.4" />
          <ellipse cx="140" cy="68" rx="121.5" ry="47.5" fill="none" stroke="#94a3b8" stroke-width="1.4" />
        </svg>
        <div class="tq-car" style="offset-distance: 12%; animation-delay: -0.72s">
          <span class="flex h-3.5 w-8 items-center justify-end rounded-l-md rounded-r-full bg-coral pr-1">
            <span class="h-1.5 w-1.5 rounded-full bg-white/90" />
          </span>
        </div>
        <div class="tq-car" style="offset-distance: 6%; animation-delay: -0.36s">
          <span class="block h-3 w-6 rounded-sm bg-rail" />
        </div>
        <div class="tq-car" style="offset-distance: 0%">
          <span class="block h-3 w-6 rounded-sm bg-rail" />
        </div>
      </div>

      <p class="mt-6 font-mono text-sm font-medium tracking-widest text-rail-soft uppercase">
        Erreur {{ status }}
      </p>
      <h1 class="mt-2 font-display text-4xl font-extrabold tracking-tight text-balance sm:text-5xl">
        {{ notFound ? 'Train not found' : 'Ça a déraillé' }}
      </h1>

      <template v-if="notFound">
        <p class="mt-5 text-lg leading-relaxed text-balance text-rail-soft">
          Cette page n'est desservie par aucune ligne. En attendant, le train tourne en rond.
        </p>
        <p class="mt-3 text-sm text-rail-soft">
          Nous vous prions de bien vouloir nous excuser pour la gêne occasionnée.
        </p>
      </template>
      <template v-else>
        <p class="mt-5 text-lg leading-relaxed text-balance text-rail-soft">
          L'incident vient de chez nous, pas de vous. Le train reste à quai le temps qu'on
          dégage la voie.
        </p>
        <p v-if="error.message" class="mt-3 font-mono text-sm break-words text-rail-soft">
          {{ error.message }}
        </p>
      </template>

      <div class="mt-9 flex flex-wrap items-center justify-center gap-3">
        <NuxtLink
          to="/app"
          class="rounded-xl bg-coral-strong px-7 py-3 font-semibold text-white shadow-lg shadow-coral/30 transition hover:-translate-y-0.5 hover:bg-coral-ink"
        >
          Ouvrir la carte →
        </NuxtLink>
        <NuxtLink
          to="/"
          class="rounded-xl bg-white px-7 py-3 font-semibold text-rail ring-1 ring-slate-200 transition hover:ring-accent"
        >
          Retour à l'accueil
        </NuxtLink>
      </div>
    </main>

    <SiteFooter />
  </div>
</template>

<style scoped>
.tq-track {
  width: 280px;
  height: 130px;
}

/* Same coordinates as the SVG viewBox: the box is rendered at exactly 280 x 130 px. */
.tq-car {
  position: absolute;
  top: 0;
  left: 0;
  offset-path: path("M 24,68 a 116,42 0 1,1 232,0 a 116,42 0 1,1 -232,0");
  offset-rotate: auto;
  animation: tq-loop 6s linear infinite;
}

@keyframes tq-loop {
  from { offset-distance: 0%; }
  to { offset-distance: 100%; }
}

/* `none` rather than `paused`: the inline offset-distance then keeps the cars coupled. */
.tq-stalled .tq-car {
  animation: none;
}

@media (prefers-reduced-motion: reduce) {
  .tq-car {
    animation: none;
  }
}
</style>
