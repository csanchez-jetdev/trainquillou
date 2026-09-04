<script setup lang="ts">
const route = useRoute()
if (route.query.origin || route.query.mode || route.query.destination) {
  await navigateTo({ path: '/app', query: route.query })
}

const modes = [
  { key: 'from', title: 'Depuis une gare', desc: 'Tout ce qui est réservable depuis votre gare, un jour donné.' },
  { key: 'to', title: 'Vers une gare', desc: "La recherche inverse : d'où rejoindre une ville ce jour-là ?" },
  { key: 'roundtrip', title: 'Aller-retour', desc: 'Vendredi soir, retour dimanche : les deux trajets réservables.' },
  { key: 'range', title: 'Sur plusieurs jours', desc: 'Une plage de dates, et combien de jours chaque ville est joignable.' },
  { key: 'route', title: 'Itinéraire A → B', desc: 'Avec correspondances, faute de TGVmax direct.' },
]

const steps = [
  { n: '1', title: 'Choisissez votre gare et la date', desc: 'Une gare de départ (ou d’arrivée), une date. Pas de compte, pas de formulaire interminable.' },
  { n: '2', title: 'Visualisez sur la carte', desc: 'Les destinations réservables apparaissent comme points reliés à votre gare, avec les horaires.' },
  { n: '3', title: 'Réservez sur SNCF Connect', desc: 'Trainquillou vous montre où aller ; la réservation TGVmax se fait ensuite côté SNCF.' },
]

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

/** Rendered on the page and declared as JSON-LD: the markup must match what is visible. */
const FAQ = [
  {
    q: 'Qu\'est-ce que TGVmax ?',
    a: 'Un abonnement SNCF pour les 16-27 ans donnant accès à un nombre illimité de trajets sur '
      + 'les trains éligibles, dans la limite des places réservées à l\'abonnement. Ces places sont '
      + 'contingentées : un train peut circuler sans être ouvert à l\'abonnement. C\'est ce '
      + 'contingent que Trainquillou rend visible.',
  },
  {
    q: 'TGVmax ou MAX JEUNE : quel est le bon nom ?',
    a: 'Les deux désignent le même abonnement. La SNCF l\'a renommé MAX JEUNE en 2023, aux côtés '
      + 'de MAX ACTIF et MAX SENIOR ; « TGVmax » reste le nom sous lequel la plupart des abonnés '
      + 'le connaissent, et celui du jeu de données open data. Trainquillou emploie donc les deux.',
  },
  {
    q: 'Trainquillou est-il gratuit ?',
    a: 'Oui, entièrement. Pas de compte, pas de paywall, pas de publicité, pas de régie ni de '
      + 'traceur commercial. Le code est ouvert sous licence AGPL-3.0.',
  },
  {
    q: 'Trainquillou réserve-t-il mes billets ?',
    a: 'Non. Il montre où il reste des places TGVmax et renvoie vers SNCF Connect ou Trainline '
      + 'pour la réservation. Il n\'est pas affilié à la SNCF.',
  },
  {
    q: 'Les disponibilités sont-elles à jour ?',
    a: 'Elles proviennent du jeu de données open data SNCF « tgvmax », que la SNCF rafraîchit '
      + 'chaque jour en début de matinée. Trainquillou garde chaque recherche dix minutes en cache '
      + 'pour ne pas marteler son API. Une place peut donc partir entre l\'affichage et votre '
      + 'réservation.',
  },
  {
    q: 'Combien de gares sont couvertes ?',
    a: 'Les 341 gares du jeu de données TGVmax, dont les destinations à l\'étranger : Bruxelles, '
      + 'Genève, Luxembourg, Barcelone, Milan, Berlin, Munich et Francfort.',
  },
  {
    q: 'Quelle part des trains est réservable avec TGVmax ?',
    a: 'Une minorité, et elle varie beaucoup selon l\'axe commercial, le jour de départ et la '
      + 'distance à ce départ : les places d\'abonnement n\'ouvrent que 30 jours avant, et le bord '
      + 'lointain de la fenêtre vient tout juste de s\'ouvrir. La page Statistiques compte les '
      + 'trains publiés et ceux qui ouvrent une place, chaque jour, pour toute la France ou pour '
      + 'une gare de départ au choix.',
  },
  {
    q: 'Comment trouver un aller-retour pour un week-end ?',
    a: 'Le mode « Aller-retour » demande une date de départ et une date de retour, puis n\'affiche '
      + 'que les destinations dont les deux trajets ont des places réservables.',
  },
  {
    q: 'Qui est derrière Trainquillou ?',
    a: 'Un projet indépendant, développé et maintenu par Clément sur son temps libre, dont le code '
      + 'est public sous licence AGPL-3.0. Les signalements et les demandes passent par les issues '
      + 'du dépôt GitHub, où l\'historique des corrections est visible de tous.',
  },
  {
    q: 'Où le site est-il hébergé, et que mesure-t-il ?',
    a: 'Sur un serveur privé loué chez OVH, à Gravelines (Nord, France), sans CDN intermédiaire. '
      + 'La mesure d\'audience de l\'instance officielle est assurée par Rybbit, qui fonctionne '
      + 'sans cookie, sans identifiant persistant et sans stocker les adresses IP. '
      + 'Aucun compte, aucune donnée personnelle enregistrée.',
  },
]

const { data: updated } = useFetch<{ updatedOn: string | null, eligibleShare: number | null }>(
  '/api/updated',
  { key: 'updated', server: false },
)

const ingestedOn = computed(() => {
  // `new Date('2026-08-03')` is UTC midnight, a day off west of London.
  const [y, m, d] = (updated.value?.updatedOn ?? '').split('-')
  if (!y || !m || !d) return null
  return new Date(Number(y), Number(m) - 1, Number(d))
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
})

const eligibleShare = computed(() => {
  const share = updated.value?.eligibleShare
  if (typeof share !== 'number') return null
  return new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 }).format(share)
})

const { public: { siteUrl } } = useRuntimeConfig()
const base = siteUrl.replace(/\/$/, '')

useHead({
  title: 'Trainquillou — destinations TGVmax (MAX JEUNE) sur une carte, gratuit',
  link: [{ rel: 'canonical', href: base }],
  meta: [{ property: 'og:url', content: base }],
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
    <!-- No `overflow-hidden`: the station suggestion list has to overflow the banner. -->
    <section class="relative flex min-h-[88dvh] w-full flex-col">
      <picture>
        <source
          type="image/avif"
          srcset="/hero-800.avif 800w, /hero-1672.avif 1672w"
          sizes="100vw"
        >
        <img
          src="/hero.jpg"
          srcset="/hero-800.jpg 800w, /hero-1200.jpg 1200w, /hero.jpg 1672w"
          sizes="100vw"
          alt="Un TGV lancé à travers une campagne française vallonnée au coucher du soleil, un village perché à l'horizon"
          fetchpriority="high"
          width="1672"
          height="941"
          class="absolute inset-0 h-full w-full object-cover"
        >
      </picture>
      <div class="absolute inset-0 bg-gradient-to-r from-rail/95 via-rail/55 to-rail/10" />
      <div class="absolute inset-0 bg-gradient-to-tr from-accent/20 via-transparent to-coral/15" />

      <header class="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <span class="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-white">
          <!-- Decorative: the name follows in the same element, a filled alt would say it twice. -->
          <img
            src="/logo-mark-white.png"
            alt=""
            aria-hidden="true"
            width="36"
            height="36"
            class="h-9 w-9 object-contain"
          >
          Trainquillou
        </span>
        <div class="flex items-center gap-5 text-sm font-medium text-white/80">
          <a
            href="https://data.sncf.com/explore/dataset/tgvmax/"
            target="_blank"
            rel="noopener"
            class="hidden transition hover:text-white sm:block"
          >
            Open data SNCF
          </a>
          <GithubLink label="GitHub" class="transition hover:text-white" />
        </div>
      </header>

      <div class="relative z-10 flex flex-1 items-center px-5 pb-12 sm:px-8">
        <div class="max-w-xl">
          <p
            v-if="ingestedOn"
            class="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/25 backdrop-blur"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-coral" />
            données du {{ ingestedOn }}
          </p>
          <h1 class="font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl">
            Vos destinations <span class="text-coral">TGVmax</span><br>
            sur une carte.
          </h1>
          <p class="mt-4 text-lg text-white/85">
            Trouvez où partir avec votre abonnement TGVmax (MAX JEUNE) depuis n'importe
            quelle gare, à n'importe quelle date. Open data, open source, sans pub.
          </p>
          <HeroSearch class="mt-7" />
          <p class="mt-3 text-sm text-white/75">
            Ou
            <NuxtLink to="/app?mode=to" class="font-medium text-white underline decoration-white/40 underline-offset-2 transition hover:decoration-white">chercher à l'envers</NuxtLink>,
            <NuxtLink to="/app?mode=roundtrip" class="font-medium text-white underline decoration-white/40 underline-offset-2 transition hover:decoration-white">un aller-retour</NuxtLink>,
            ou
            <NuxtLink to="/app?mode=route" class="font-medium text-white underline decoration-white/40 underline-offset-2 transition hover:decoration-white">composer un itinéraire</NuxtLink>.
          </p>
        </div>
      </div>
    </section>

    <AppPreview />

    <section class="mx-auto max-w-6xl px-5 py-16 sm:px-8">
      <h2 class="font-display text-2xl font-bold tracking-tight sm:text-3xl">Cinq façons d'explorer</h2>
      <p class="mt-2 max-w-2xl text-rail-soft">
        La même carte, cinq angles d'attaque selon votre envie de voyage.
      </p>
      <div class="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <NuxtLink
          v-for="m in modes"
          :key="m.key"
          :to="`/app?mode=${m.key}`"
          class="group flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-accent hover:shadow-lg hover:shadow-accent/10"
        >
          <span class="grid h-11 w-11 place-items-center rounded-xl bg-accent/15 text-accent-strong">
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
          <span class="mt-auto pt-3 text-sm font-medium text-accent-strong transition group-hover:translate-x-1">
            Essayer →
          </span>
        </NuxtLink>
      </div>
    </section>

    <section class="bg-white py-16">
      <div class="mx-auto max-w-6xl px-5 sm:px-8">
        <h2 class="font-display text-2xl font-bold tracking-tight sm:text-3xl">Comment ça marche</h2>
        <div class="mt-8 grid gap-8 sm:grid-cols-3">
          <div v-for="s in steps" :key="s.n">
            <span class="grid h-11 w-11 place-items-center rounded-full bg-rail text-base font-bold text-white">{{ s.n }}</span>
            <h3 class="mt-4 font-semibold text-rail">{{ s.title }}</h3>
            <p class="mt-1 text-sm text-rail-soft">{{ s.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="mx-auto max-w-6xl px-5 py-16 sm:px-8">
      <div class="grid gap-4 sm:grid-cols-3">
        <div class="rounded-2xl border border-slate-200 bg-white p-6 border-t-4 border-t-accent">
          <h3 class="font-semibold text-rail">Vraiment gratuit</h3>
          <p class="mt-1 text-sm text-rail-soft">Aucun paywall, aucune fonctionnalité réservée, aucun compte à créer.</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-6 border-t-4 border-t-accent">
          <h3 class="font-semibold text-rail">Open data</h3>
          <p class="mt-1 text-sm text-rail-soft">Données officielles open data SNCF (dataset TGVmax + référentiel des gares).</p>
        </div>
        <div class="rounded-2xl border border-slate-200 bg-white p-6 border-t-4 border-t-accent">
          <h3 class="font-semibold text-rail">Open source</h3>
          <p class="mt-1 text-sm text-rail-soft">
            Code ouvert sous licence AGPL-3.0.
            <GithubLink label="Voir le dépôt" class="font-medium text-accent-strong hover:underline" />
          </p>
        </div>
      </div>

      <div class="mt-14">
        <h2 class="font-display text-2xl font-bold tracking-tight sm:text-3xl">Partir de votre gare</h2>
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

      <div class="mt-14">
        <h2 class="font-display text-2xl font-bold tracking-tight sm:text-3xl">Questions fréquentes</h2>
        <div class="mt-6 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <details v-for="f in FAQ" :key="f.q" class="group">
            <summary class="flex cursor-pointer list-none items-center gap-3 p-5 font-semibold text-rail transition hover:bg-slate-50">
              <span class="flex-1">{{ f.q }}</span>
              <svg class="h-4 w-4 shrink-0 text-rail-soft transition group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <p class="px-5 pb-5 text-sm leading-relaxed text-rail-soft">{{ f.a }}</p>
          </details>
        </div>
        <p class="mt-4 text-sm text-rail-soft">
          Le détail de la méthode, des sources et de l'hébergement est sur la page
          <NuxtLink to="/a-propos" class="font-medium text-accent-strong hover:underline">À propos</NuxtLink>.
        </p>
      </div>

      <div class="mt-12 grid gap-6 rounded-3xl border border-slate-200 bg-white p-6 sm:grid-cols-[auto_1fr] sm:items-center sm:p-8">
        <p v-if="eligibleShare" class="text-5xl font-semibold leading-none tracking-tight text-rail sm:text-6xl">
          {{ eligibleShare }}
        </p>
        <div>
          <h2 class="font-display text-2xl font-bold tracking-tight">
            L'offre TGVmax en chiffres, recomptée chaque jour
          </h2>
          <p class="mt-3 leading-relaxed text-rail-soft">
            <template v-if="eligibleShare">
              {{ eligibleShare }} des trains que la SNCF publie ouvrent une place d'abonnement.
            </template>
            Le reste circule sans elle. Nous comptons les deux tous les jours : par axe
            commercial, par jour de départ, par heure, et gare par gare.
          </p>
          <p class="mt-4">
            <NuxtLink
              to="/stats"
              class="font-medium text-accent-strong underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            >
              Voir les statistiques TGVmax, gare par gare
            </NuxtLink>
          </p>
        </div>
      </div>

      <div class="mt-12 overflow-hidden rounded-3xl bg-rail px-6 py-14 text-center">
        <h2 class="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">Prêt à trouver votre prochaine escapade ?</h2>
        <NuxtLink
          to="/app"
          class="mt-6 inline-block rounded-xl bg-coral px-8 py-3 text-base font-semibold text-white shadow-lg shadow-coral/40 transition hover:-translate-y-0.5 hover:bg-coral-strong"
        >
          Ouvrir l'application →
        </NuxtLink>
      </div>
    </section>

    <footer class="border-t border-slate-200 py-8">
      <div class="mx-auto flex max-w-6xl flex-col items-center gap-2 px-5 text-center text-sm text-rail-soft sm:px-8">
        <p class="flex items-center gap-2 font-semibold text-rail">
          <img
            src="/logo-mark.png"
            alt=""
            aria-hidden="true"
            width="28"
            height="28"
            class="h-7 w-7 object-contain"
          >
          Trainquillou
        </p>
        <p>
          Données <a class="underline hover:text-rail" href="https://data.sncf.com/explore/dataset/tgvmax/" target="_blank" rel="noopener">open data SNCF</a>
          · fond de carte <a class="underline hover:text-rail" href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>,
          données © <a class="underline hover:text-rail" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>
          · licence AGPL-3.0
        </p>
        <p class="text-rail-soft/70">Non affilié à la SNCF. La réservation des places TGVmax se fait sur SNCF Connect.</p>
        <p class="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <NuxtLink to="/a-propos" class="font-medium text-rail transition hover:text-accent-strong">À propos</NuxtLink>
          <span aria-hidden="true" class="text-rail-soft/40">·</span>
          <NuxtLink to="/stats" class="font-medium text-rail transition hover:text-accent-strong">Statistiques</NuxtLink>
          <span aria-hidden="true" class="text-rail-soft/40">·</span>
          <GithubLink label="Code source sur GitHub" class="font-medium text-rail transition hover:text-accent-strong" />
        </p>
      </div>
    </footer>
  </div>
</template>
