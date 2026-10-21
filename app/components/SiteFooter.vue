<script setup lang="ts">
import { POPULAR_STATIONS } from '~~/shared/stations'

/** `/stats` lays its content out wider than the other pages, and its footer follows. */
const { wide = false } = defineProps<{ wide?: boolean }>()

const LINKS = [
  { to: '/simulateur-tgvmax', label: 'Simulateur TGVmax' },
  { to: '/liaisons', label: 'Liaisons suivies' },
  { to: '/stats', label: 'Statistiques de l\'offre' },
  { to: '/app', label: 'Ouvrir la carte' },
  { to: '/a-propos', label: 'Méthode et sources' },
]
</script>

<template>
  <footer class="mt-16 border-t border-slate-200 bg-white">
    <div
      class="mx-auto px-5 py-10 sm:px-8"
      :class="wide ? 'max-w-5xl' : 'max-w-4xl'"
    >
      <nav aria-label="Pied de page" class="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <NuxtLink
          v-for="l in LINKS"
          :key="l.to"
          :to="l.to"
          class="font-medium text-accent-strong hover:underline"
        >{{ l.label }}</NuxtLink>
      </nav>

      <p class="mt-5 text-sm text-rail-soft">
        Départs les plus cherchés :
        <NuxtLink
          v-for="(p, i) in POPULAR_STATIONS"
          :key="p.slug"
          :to="`/depuis/${p.slug}`"
          class="hover:text-rail hover:underline"
        >{{ p.name }}<span v-if="i < POPULAR_STATIONS.length - 1" aria-hidden="true"> · </span></NuxtLink>
      </p>

      <p class="mt-5 text-sm text-rail-soft">
        Disponibilités issues de l'<a
          class="underline hover:text-rail"
          href="https://ressources.data.sncf.com/explore/dataset/tgvmax/"
          target="_blank"
          rel="noopener"
        >open data SNCF</a>, republié une fois par jour. Fond de carte
        <a
          class="underline hover:text-rail"
          href="https://openfreemap.org"
          target="_blank"
          rel="noopener"
        >OpenFreeMap</a>, données
        <a
          class="underline hover:text-rail"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noopener"
        >OpenStreetMap</a>. Trainquillou n'est pas affilié à la SNCF et ne vend pas de billets.
      </p>
    </div>
  </footer>
</template>
