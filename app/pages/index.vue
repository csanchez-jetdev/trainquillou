<script setup lang="ts">
import type { SearchResult } from '~~/shared/types'

// Compatibilité : les anciens liens partagés (/?origin=…) sont redirigés vers /app.
const route = useRoute()
if (route.query.origin || route.query.mode || route.query.destination) {
  await navigateTo({ path: '/app', query: route.query })
}

// Carte décorative du hero : un échantillon statique (aucun appel réseau).
const heroSample: SearchResult = {
  origin: { label: 'PARIS', coords: [48.8566, 2.3522] },
  date: '',
  mode: 'from',
  destinations: [
    { label: 'LYON', coords: [45.7640, 4.8357], trains: [] },
    { label: 'BORDEAUX', coords: [44.8378, -0.5792], trains: [] },
    { label: 'MARSEILLE', coords: [43.2965, 5.3698], trains: [] },
    { label: 'NANTES', coords: [47.2184, -1.5536], trains: [] },
    { label: 'STRASBOURG', coords: [48.5734, 7.7521], trains: [] },
    { label: 'LILLE', coords: [50.6292, 3.0573], trains: [] },
    { label: 'NICE', coords: [43.7102, 7.2620], trains: [] },
    { label: 'RENNES', coords: [48.1173, -1.6778], trains: [] },
    { label: 'MONTPELLIER', coords: [43.6108, 3.8767], trains: [] },
  ],
}

const modes = [
  { key: 'from', title: 'Depuis une gare', desc: 'Toutes les destinations TGVmax réservables depuis votre gare, un jour donné, posées sur la carte.' },
  { key: 'to', title: 'Vers une gare', desc: "Recherche inverse : d'où peut-on rejoindre une ville en TGVmax ce jour-là ?" },
  { key: 'range', title: 'Sur plusieurs jours', desc: 'Explorez une plage de dates : voyez les destinations joignables et combien de jours elles le sont.' },
  { key: 'route', title: 'Itinéraire A → B', desc: "Composez un trajet avec correspondances quand il n'y a pas de TGVmax direct entre deux villes." },
]

const steps = [
  { n: '1', title: 'Choisissez votre gare et la date', desc: 'Une gare de départ (ou d’arrivée), une date. Pas de compte, pas de formulaire interminable.' },
  { n: '2', title: 'Visualisez sur la carte', desc: 'Les destinations réservables apparaissent comme points reliés à votre gare, avec les horaires.' },
  { n: '3', title: 'Réservez sur SNCF Connect', desc: 'Trainquillou vous montre où aller ; la réservation TGVmax se fait ensuite côté SNCF.' },
]

useHead({
  title: 'Trainquillou — destinations TGVmax sur une carte, gratuit et sans compte',
})
</script>

<template>
  <div class="min-h-[100dvh] bg-[#f6f8fb] text-rail">
    <!-- HERO -->
    <section class="relative h-[88vh] min-h-[34rem] w-full overflow-hidden">
      <!-- Carte décorative en fond -->
      <MapView class="pointer-events-none absolute inset-0" :result="heroSample" :hovered="null" />
      <!-- Voile pour le contraste -->
      <div class="absolute inset-0 bg-gradient-to-r from-rail/85 via-rail/45 to-transparent" />

      <!-- En-tête transparent -->
      <header class="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <span class="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
          <span class="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white">T</span>
          Trainquillou
        </span>
        <a
          href="https://data.sncf.com/explore/dataset/tgvmax/"
          target="_blank"
          rel="noopener"
          class="hidden text-sm font-medium text-white/80 transition hover:text-white sm:block"
        >
          Open data SNCF
        </a>
      </header>

      <!-- Pitch + CTA -->
      <div class="relative z-10 flex h-[calc(100%-4rem)] items-center px-5 sm:px-8">
        <div class="max-w-xl">
          <p class="mb-3 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/25 backdrop-blur">
            100% gratuit · sans paywall · sans compte
          </p>
          <h1 class="text-4xl font-extrabold leading-tight text-white sm:text-5xl">
            Vos destinations <span class="text-accent">TGVmax</span><br>
            sur une carte, en un coup d'œil.
          </h1>
          <p class="mt-4 text-lg text-white/85">
            Trouvez où partir avec votre abonnement TGVmax depuis n'importe quelle gare,
            à n'importe quelle date. Open data, open source, sans pub.
          </p>
          <div class="mt-7 flex flex-wrap items-center gap-3">
            <NuxtLink
              to="/app"
              class="rounded-xl bg-accent px-6 py-3 text-base font-semibold text-white shadow-lg shadow-accent/30 transition hover:bg-accent-strong"
            >
              Ouvrir l'application →
            </NuxtLink>
            <NuxtLink
              to="/app?mode=route"
              class="rounded-xl bg-white/10 px-6 py-3 text-base font-semibold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/20"
            >
              Composer un itinéraire
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <!-- LES 4 MODES -->
    <section class="mx-auto max-w-6xl px-5 py-16 sm:px-8">
      <h2 class="text-2xl font-bold sm:text-3xl">Quatre façons d'explorer</h2>
      <p class="mt-2 max-w-2xl text-rail-soft">
        La même carte, quatre angles d'attaque selon votre envie de voyage.
      </p>
      <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <NuxtLink
          v-for="m in modes"
          :key="m.key"
          :to="`/app?mode=${m.key}`"
          class="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
        >
          <span class="grid h-10 w-10 place-items-center rounded-xl bg-accent/10 text-accent-strong">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3" /><path d="M12 21s-7-5.5-7-11a7 7 0 1 1 14 0c0 5.5-7 11-7 11z" /></svg>
          </span>
          <h3 class="mt-4 font-semibold text-rail">{{ m.title }}</h3>
          <p class="mt-1 text-sm text-rail-soft">{{ m.desc }}</p>
          <span class="mt-3 inline-block text-sm font-medium text-accent-strong opacity-0 transition group-hover:opacity-100">
            Essayer →
          </span>
        </NuxtLink>
      </div>
    </section>

    <!-- COMMENT CA MARCHE -->
    <section class="bg-white py-16">
      <div class="mx-auto max-w-6xl px-5 sm:px-8">
        <h2 class="text-2xl font-bold sm:text-3xl">Comment ça marche</h2>
        <div class="mt-8 grid gap-8 sm:grid-cols-3">
          <div v-for="s in steps" :key="s.n">
            <span class="grid h-10 w-10 place-items-center rounded-full bg-rail text-base font-bold text-white">{{ s.n }}</span>
            <h3 class="mt-4 font-semibold text-rail">{{ s.title }}</h3>
            <p class="mt-1 text-sm text-rail-soft">{{ s.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- BANDEAU VALEURS -->
    <section class="mx-auto max-w-6xl px-5 py-16 sm:px-8">
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 class="font-semibold text-rail">Vraiment gratuit</h3>
          <p class="mt-1 text-sm text-rail-soft">Aucun paywall, aucune fonctionnalité réservée, aucun compte à créer.</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 class="font-semibold text-rail">Open data</h3>
          <p class="mt-1 text-sm text-rail-soft">Données officielles open data SNCF (dataset TGVmax + référentiel des gares).</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-6">
          <h3 class="font-semibold text-rail">Open source</h3>
          <p class="mt-1 text-sm text-rail-soft">Code ouvert sous licence AGPL-3.0, sans tracking ni publicité.</p>
        </div>
      </div>

      <div class="mt-12 rounded-3xl bg-rail px-6 py-12 text-center">
        <h2 class="text-2xl font-bold text-white sm:text-3xl">Prêt à trouver votre prochaine escapade ?</h2>
        <NuxtLink
          to="/app"
          class="mt-6 inline-block rounded-xl bg-accent px-8 py-3 text-base font-semibold text-white shadow-lg shadow-accent/30 transition hover:bg-accent-strong"
        >
          Ouvrir l'application →
        </NuxtLink>
      </div>
    </section>

    <!-- FOOTER -->
    <footer class="border-t border-slate-200 py-8">
      <div class="mx-auto flex max-w-6xl flex-col items-center gap-2 px-5 text-center text-sm text-rail-soft sm:px-8">
        <p class="font-semibold text-rail">Trainquillou</p>
        <p>
          Données <a class="underline hover:text-rail" href="https://data.sncf.com/explore/dataset/tgvmax/" target="_blank" rel="noopener">open data SNCF</a>
          · fond de carte © <a class="underline hover:text-rail" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>, MapLibre
          · licence AGPL-3.0
        </p>
        <p class="text-rail-soft/70">Non affilié à la SNCF. La réservation des places TGVmax se fait sur SNCF Connect.</p>
      </div>
    </footer>
  </div>
</template>
