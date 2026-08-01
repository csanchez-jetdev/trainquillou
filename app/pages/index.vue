<script setup lang="ts">
// Compatibilité : les anciens liens partagés (/?origin=…) sont redirigés vers /app.
const route = useRoute()
if (route.query.origin || route.query.mode || route.query.destination) {
  await navigateTo({ path: '/app', query: route.query })
}

const modes = [
  { key: 'from', title: 'Depuis une gare', desc: 'Toutes les destinations TGVmax réservables depuis votre gare, un jour donné, posées sur la carte.', chip: 'bg-accent/15 text-accent-strong' },
  { key: 'to', title: 'Vers une gare', desc: "Recherche inverse : d'où peut-on rejoindre une ville en TGVmax ce jour-là ?", chip: 'bg-coral/15 text-coral-strong' },
  { key: 'roundtrip', title: 'Aller-retour', desc: 'Vous partez vendredi, vous rentrez dimanche : seules les destinations dont les deux trajets sont réservables.', chip: 'bg-coral/15 text-coral-strong' },
  { key: 'range', title: 'Sur plusieurs jours', desc: 'Explorez une plage de dates : voyez les destinations joignables et combien de jours elles le sont.', chip: 'bg-rail/10 text-rail' },
  { key: 'route', title: 'Itinéraire A → B', desc: "Composez un trajet avec correspondances quand il n'y a pas de TGVmax direct entre deux villes.", chip: 'bg-sun/20 text-amber-600' },
]

const steps = [
  { n: '1', title: 'Choisissez votre gare et la date', desc: 'Une gare de départ (ou d’arrivée), une date. Pas de compte, pas de formulaire interminable.' },
  { n: '2', title: 'Visualisez sur la carte', desc: 'Les destinations réservables apparaissent comme points reliés à votre gare, avec les horaires.' },
  { n: '3', title: 'Réservez sur SNCF Connect', desc: 'Trainquillou vous montre où aller ; la réservation TGVmax se fait ensuite côté SNCF.' },
]

/** Gares les plus recherchées, vers leurs pages d'entrée (maillage interne). */
const POPULAR = [
  { slug: 'paris', name: 'Paris' },
  { slug: 'lyon', name: 'Lyon' },
  { slug: 'marseille-st-charles', name: 'Marseille' },
  { slug: 'bordeaux-st-jean', name: 'Bordeaux' },
  { slug: 'lille', name: 'Lille' },
  { slug: 'nantes', name: 'Nantes' },
  { slug: 'strasbourg', name: 'Strasbourg' },
  { slug: 'toulouse-matabiau', name: 'Toulouse' },
  { slug: 'montpellier', name: 'Montpellier' },
  { slug: 'nice-ville', name: 'Nice' },
  { slug: 'rennes', name: 'Rennes' },
  { slug: 'dijon-ville', name: 'Dijon' },
]

/** La FAQ est affichée ET déclarée en JSON-LD : le balisage doit refléter le visible. */
const FAQ = [
  {
    q: 'Qu\'est-ce que TGVmax ?',
    a: 'Un abonnement SNCF pour les 16-27 ans donnant accès à un nombre illimité de trajets sur '
      + 'les trains éligibles, dans la limite des places réservées à l\'abonnement. Ces places sont '
      + 'contingentées : un train peut circuler sans être ouvert à TGVmax. C\'est ce contingent que '
      + 'Trainquillou rend visible.',
  },
  {
    q: 'Trainquillou est-il gratuit ?',
    a: 'Oui, entièrement. Pas de compte, pas de paywall, pas de publicité, pas de traceur '
      + 'analytique. Le code est ouvert sous licence AGPL-3.0.',
  },
  {
    q: 'Trainquillou réserve-t-il mes billets ?',
    a: 'Non. Il montre où il reste des places TGVmax et renvoie vers SNCF Connect ou Trainline '
      + 'pour la réservation. Il n\'est pas affilié à la SNCF.',
  },
  {
    q: 'Les disponibilités sont-elles à jour ?',
    a: 'Elles proviennent du jeu de données open data SNCF « tgvmax » et sont mises en cache dix '
      + 'minutes par recherche. Une place peut donc partir entre l\'affichage et votre réservation.',
  },
  {
    q: 'Combien de gares sont couvertes ?',
    a: 'Les 341 gares du jeu de données TGVmax, dont les destinations à l\'étranger : Bruxelles, '
      + 'Genève, Luxembourg, Barcelone, Milan, Berlin, Munich et Francfort.',
  },
  {
    q: 'Comment trouver un aller-retour pour un week-end ?',
    a: 'Le mode « Aller-retour » demande une date de départ et une date de retour, puis n\'affiche '
      + 'que les destinations dont les deux trajets ont des places TGVmax réservables.',
  },
]

const { public: { siteUrl } } = useRuntimeConfig()
const base = siteUrl.replace(/\/$/, '')

useHead({
  title: 'Trainquillou — destinations TGVmax sur une carte, gratuit et sans compte',
  link: [{ rel: 'canonical', href: base }],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Trainquillou',
        url: base,
        applicationCategory: 'TravelApplication',
        operatingSystem: 'Web',
        inLanguage: 'fr',
        description: 'Trouvez les destinations TGVmax réservables depuis votre gare, sur une carte '
          + 'interactive. Gratuit, sans compte, sans publicité.',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
        license: 'https://www.gnu.org/licenses/agpl-3.0.html',
        isAccessibleForFree: true,
      }),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: FAQ.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      }),
    },
  ],
})
</script>

<template>
  <div class="min-h-[100dvh] bg-cream text-rail">
    <!-- HERO -->
    <section class="relative h-[88vh] min-h-[34rem] w-full overflow-hidden">
      <!-- Image de fond -->
      <img
        src="/hero.jpg"
        alt=""
        fetchpriority="high"
        width="1672"
        height="941"
        class="absolute inset-0 h-full w-full object-cover"
      >
      <!-- Voiles : navy à gauche pour la lisibilité du texte, halo teal/corail pour la couleur de marque -->
      <div class="absolute inset-0 bg-gradient-to-r from-rail/95 via-rail/55 to-rail/10" />
      <div class="absolute inset-0 bg-gradient-to-tr from-accent/20 via-transparent to-coral/15" />

      <!-- En-tête transparent -->
      <header class="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <span class="flex items-center gap-2 text-lg font-bold tracking-tight text-white">
          <img src="/logo-mark-white.png" alt="Trainquillou" class="h-9 w-9 object-contain">
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
          <p class="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/25 backdrop-blur">
            <span class="h-1.5 w-1.5 rounded-full bg-coral" />
            100% gratuit · sans paywall · sans compte
          </p>
          <h1 class="text-4xl font-extrabold leading-tight text-white sm:text-5xl">
            Vos destinations <span class="text-gradient">TGVmax</span><br>
            sur une carte, en un coup d'œil.
          </h1>
          <p class="mt-4 text-lg text-white/85">
            Trouvez où partir avec votre abonnement TGVmax depuis n'importe quelle gare,
            à n'importe quelle date. Open data, open source, sans pub.
          </p>
          <div class="mt-7 flex flex-wrap items-center gap-3">
            <NuxtLink
              to="/app"
              class="rounded-xl bg-coral px-6 py-3 text-base font-semibold text-white shadow-lg shadow-coral/40 transition hover:-translate-y-0.5 hover:bg-coral-strong"
            >
              Ouvrir l'application →
            </NuxtLink>
            <NuxtLink
              to="/app?mode=route"
              class="rounded-xl bg-white/10 px-6 py-3 text-base font-semibold text-white ring-1 ring-white/30 backdrop-blur transition hover:bg-white/20"
            >
              Composer un itinéraire
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <!-- LES 4 MODES -->
    <section class="mx-auto max-w-6xl px-5 py-16 sm:px-8">
      <h2 class="text-2xl font-bold sm:text-3xl">Cinq façons d'explorer</h2>
      <p class="mt-2 max-w-2xl text-rail-soft">
        La même carte, cinq angles d'attaque selon votre envie de voyage.
      </p>
      <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <NuxtLink
          v-for="m in modes"
          :key="m.key"
          :to="`/app?mode=${m.key}`"
          class="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-accent hover:shadow-lg hover:shadow-accent/10"
        >
          <span class="grid h-11 w-11 place-items-center rounded-xl" :class="m.chip">
            <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <template v-if="m.key === 'from'"><circle cx="12" cy="12" r="9" /><path d="M9 15 15 9M10 9h5v5" /></template>
              <template v-else-if="m.key === 'to'"><circle cx="12" cy="12" r="9" /><path d="M15 9 9 15M9 10v5h5" /></template>
              <template v-else-if="m.key === 'roundtrip'"><path d="M4 8h13a3 3 0 0 1 0 6H7" /><path d="m7 5 3 3-3 3M17 19l-3-3 3-3" /></template>
              <template v-else-if="m.key === 'range'"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></template>
              <template v-else><circle cx="5" cy="6" r="2" /><circle cx="19" cy="18" r="2" /><path d="M7 6h6a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6" /></template>
            </svg>
          </span>
          <h3 class="mt-4 font-semibold text-rail">{{ m.title }}</h3>
          <p class="mt-1 text-sm text-rail-soft">{{ m.desc }}</p>
          <span class="mt-3 inline-block text-sm font-medium text-accent-strong transition group-hover:translate-x-1">
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
            <span class="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-accent to-coral text-base font-bold text-white shadow-md shadow-accent/20">{{ s.n }}</span>
            <h3 class="mt-4 font-semibold text-rail">{{ s.title }}</h3>
            <p class="mt-1 text-sm text-rail-soft">{{ s.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- BANDEAU VALEURS -->
    <section class="mx-auto max-w-6xl px-5 py-16 sm:px-8">
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="rounded-2xl border border-slate-200 bg-white p-6 border-t-4 border-t-accent">
          <h3 class="font-semibold text-rail">Vraiment gratuit</h3>
          <p class="mt-1 text-sm text-rail-soft">Aucun paywall, aucune fonctionnalité réservée, aucun compte à créer.</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-6 border-t-4 border-t-coral">
          <h3 class="font-semibold text-rail">Open data</h3>
          <p class="mt-1 text-sm text-rail-soft">Données officielles open data SNCF (dataset TGVmax + référentiel des gares).</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-6 border-t-4 border-t-sun">
          <h3 class="font-semibold text-rail">Open source</h3>
          <p class="mt-1 text-sm text-rail-soft">Code ouvert sous licence AGPL-3.0, sans tracking ni publicité.</p>
        </div>
      </div>

      <!-- MAILLAGE : une page d'entrée par gare de départ -->
      <div class="mt-14">
        <h2 class="text-2xl font-bold sm:text-3xl">Partir de votre gare</h2>
        <p class="mt-2 text-rail-soft">
          Les 341 gares du réseau TGVmax sont couvertes. Voici les départs les plus recherchés.
        </p>
        <ul class="mt-5 flex flex-wrap gap-2">
          <li v-for="p in POPULAR" :key="p.slug">
            <NuxtLink
              :to="`/depuis/${p.slug}`"
              class="inline-block rounded-lg bg-white px-3.5 py-2 text-sm font-medium ring-1 ring-slate-200 transition hover:text-accent-strong hover:ring-accent"
            >
              Depuis {{ p.name }}
            </NuxtLink>
          </li>
        </ul>
      </div>

      <!-- FAQ : reprise à l'identique dans le JSON-LD FAQPage -->
      <div class="mt-14">
        <h2 class="text-2xl font-bold sm:text-3xl">Questions fréquentes</h2>
        <dl class="mt-6 divide-y divide-slate-200 rounded-2xl border border-slate-200 bg-white">
          <div v-for="f in FAQ" :key="f.q" class="p-5">
            <dt class="font-semibold text-rail">{{ f.q }}</dt>
            <dd class="mt-1.5 text-sm leading-relaxed text-rail-soft">{{ f.a }}</dd>
          </div>
        </dl>
      </div>

      <div class="relative mt-12 overflow-hidden rounded-3xl bg-gradient-to-br from-rail via-rail to-accent-strong px-6 py-14 text-center">
        <div class="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-coral/30 blur-3xl" />
        <div class="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-accent/30 blur-3xl" />
        <h2 class="relative text-2xl font-bold text-white sm:text-3xl">Prêt à trouver votre prochaine escapade ?</h2>
        <NuxtLink
          to="/app"
          class="relative mt-6 inline-block rounded-xl bg-coral px-8 py-3 text-base font-semibold text-white shadow-lg shadow-coral/40 transition hover:-translate-y-0.5 hover:bg-coral-strong"
        >
          Ouvrir l'application →
        </NuxtLink>
      </div>
    </section>

    <!-- FOOTER -->
    <footer class="border-t border-slate-200 py-8">
      <div class="mx-auto flex max-w-6xl flex-col items-center gap-2 px-5 text-center text-sm text-rail-soft sm:px-8">
        <p class="flex items-center gap-2 font-semibold text-rail">
          <img src="/logo-mark.png" alt="" class="h-7 w-7 object-contain">
          Trainquillou
        </p>
        <p>
          Données <a class="underline hover:text-rail" href="https://data.sncf.com/explore/dataset/tgvmax/" target="_blank" rel="noopener">open data SNCF</a>
          · fond de carte <a class="underline hover:text-rail" href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>,
          données © <a class="underline hover:text-rail" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
          · licence AGPL-3.0
        </p>
        <p class="text-rail-soft/70">Non affilié à la SNCF. La réservation des places TGVmax se fait sur SNCF Connect.</p>
      </div>
    </footer>
  </div>
</template>
