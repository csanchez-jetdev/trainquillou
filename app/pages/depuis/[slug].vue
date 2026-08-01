<script setup lang="ts">
import { STATION_PAGES, stationBySlug, prettyLabel } from '~~/shared/stations'

/** Station landing page. Static by design: no SNCF call at build time, so 300 pages can
 *  prerender without hammering their API. Availability loads in the app itself. */
const route = useRoute()
const slug = computed(() => String(route.params.slug))

const station = computed(() => stationBySlug(slug.value))
if (!station.value) {
  throw createError({ statusCode: 404, statusMessage: 'Gare inconnue', fatal: true })
}

const name = computed(() => prettyLabel(station.value!.label))
const appLink = computed(() => `/app?origin=${encodeURIComponent(station.value!.label)}`)

/** A few neighbouring stations from the list, for internal linking. */
const others = computed(() => {
  const i = STATION_PAGES.findIndex((s) => s.slug === slug.value)
  const pool = [...STATION_PAGES.slice(i + 1), ...STATION_PAGES.slice(0, i)]
  return pool.slice(0, 12)
})

const { public: { siteUrl } } = useRuntimeConfig()
const canonical = computed(() => `${siteUrl.replace(/\/$/, '')}/depuis/${slug.value}`)

const title = computed(() => `Destinations TGVmax / MAX JEUNE depuis ${name.value} — Trainquillou`)
const description = computed(
  () => `Toutes les destinations TGVmax (MAX JEUNE) réservables depuis ${name.value}, sur une `
    + `carte. Aller-retour week-end, dates de retour, itinéraires avec correspondances. `
    + `Gratuit, sans compte.`,
)

useHead(() => ({
  title: title.value,
  link: [{ rel: 'canonical', href: canonical.value }],
  meta: [
    { name: 'description', content: description.value },
    { property: 'og:title', content: title.value },
    { property: 'og:description', content: description.value },
    { property: 'og:url', content: canonical.value },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: siteUrl },
          { '@type': 'ListItem', position: 2, name: `Depuis ${name.value}`, item: canonical.value },
        ],
      }),
    },
  ],
}))
</script>

<template>
  <div class="min-h-[100dvh] bg-cream text-rail">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-4xl items-center justify-between px-5 py-4 sm:px-8">
        <NuxtLink to="/" class="flex items-center gap-2 font-bold tracking-tight text-rail">
          <!-- Decorative: the name follows in the same link. -->
          <img
            src="/logo-mark.png"
            alt=""
            aria-hidden="true"
            width="32"
            height="32"
            class="h-8 w-8 object-contain"
          >
          Trainquillou
        </NuxtLink>
        <div class="flex items-center gap-4">
          <GithubLink class="text-rail-soft transition hover:text-rail" />
          <NuxtLink to="/app" class="text-sm font-medium text-accent-strong hover:underline">
            Ouvrir l'application →
          </NuxtLink>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-4xl px-5 py-12 sm:px-8">
      <nav aria-label="Fil d'ariane" class="mb-6 text-sm text-rail-soft">
        <NuxtLink to="/" class="hover:text-rail">Accueil</NuxtLink>
        <span class="mx-1.5">/</span>
        <span class="text-rail">Depuis {{ name }}</span>
      </nav>

      <h1 class="text-3xl font-extrabold leading-tight sm:text-4xl">
        Destinations <span class="text-gradient">TGVmax</span> depuis {{ name }}
      </h1>
      <p class="mt-4 max-w-2xl text-lg text-rail-soft">
        Où partir depuis {{ name }} avec votre abonnement TGVmax, renommé MAX JEUNE par la SNCF ?
        Choisissez une date, et toutes les destinations où il reste des places réservables
        apparaissent sur une carte.
      </p>

      <div class="mt-8 flex flex-wrap gap-3">
        <NuxtLink
          :to="appLink"
          class="rounded-xl bg-coral px-6 py-3 font-semibold text-white shadow-lg shadow-coral/30 transition hover:-translate-y-0.5 hover:bg-coral-strong"
        >
          Voir les destinations depuis {{ name }}
        </NuxtLink>
        <NuxtLink
          :to="`${appLink}&mode=roundtrip`"
          class="rounded-xl bg-white px-6 py-3 font-semibold text-rail ring-1 ring-slate-200 transition hover:ring-accent"
        >
          Chercher un aller-retour week-end
        </NuxtLink>
      </div>

      <section class="mt-14">
        <h2 class="text-xl font-bold sm:text-2xl">Ce que vous pouvez chercher depuis {{ name }}</h2>
        <ul class="mt-4 grid gap-3 sm:grid-cols-2">
          <li class="rounded-xl border border-slate-200 bg-white p-4">
            <h3 class="font-semibold">Toutes les destinations d'un jour donné</h3>
            <p class="mt-1 text-sm text-rail-soft">
              Les gares joignables en TGVmax depuis {{ name }}, avec leurs horaires de départ.
            </p>
          </li>
          <li class="rounded-xl border border-slate-200 bg-white p-4">
            <h3 class="font-semibold">Un aller-retour dont les deux trajets sont réservables</h3>
            <p class="mt-1 text-sm text-rail-soft">
              Vous partez vendredi et rentrez dimanche : seules les destinations où l'aller
              <em>et</em> le retour ont des places s'affichent.
            </p>
          </li>
          <li class="rounded-xl border border-slate-200 bg-white p-4">
            <h3 class="font-semibold">Une plage de plusieurs jours</h3>
            <p class="mt-1 text-sm text-rail-soft">
              Sur une semaine entière, quelles destinations sont joignables et combien de jours
              chacune l'est.
            </p>
          </li>
          <li class="rounded-xl border border-slate-200 bg-white p-4">
            <h3 class="font-semibold">Un trajet avec correspondances</h3>
            <p class="mt-1 text-sm text-rail-soft">
              Quand aucun TGVmax direct n'existe, l'itinéraire est composé via des gares
              intermédiaires.
            </p>
          </li>
        </ul>
      </section>

      <section class="mt-14">
        <h2 class="text-xl font-bold sm:text-2xl">Partir d'une autre gare</h2>
        <ul class="mt-4 flex flex-wrap gap-2">
          <li v-for="s in others" :key="s.slug">
            <NuxtLink
              :to="`/depuis/${s.slug}`"
              class="inline-block rounded-lg bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200 transition hover:ring-accent hover:text-accent-strong"
            >
              {{ prettyLabel(s.label) }}
            </NuxtLink>
          </li>
        </ul>
      </section>

      <p class="mt-14 text-sm text-rail-soft">
        Les disponibilités proviennent de l'<a
          class="underline hover:text-rail"
          href="https://data.sncf.com/explore/dataset/tgvmax/"
          target="_blank"
          rel="noopener"
        >open data SNCF</a>. Trainquillou n'est pas affilié à la SNCF et ne vend pas de billets ;
        la réservation se fait sur SNCF Connect.
        <NuxtLink to="/a-propos" class="font-medium text-accent-strong hover:underline">
          Méthode, sources et hébergement
        </NuxtLink>.
      </p>
    </main>
  </div>
</template>
