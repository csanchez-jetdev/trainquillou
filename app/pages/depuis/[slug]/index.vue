<script setup lang="ts">
import { STATION_PAGES, cityName, routeBySlugs, stationBySlug, prettyLabel } from '~~/shared/stations'
import { seoDescription, seoTitle } from '~~/shared/seo'
import { humanDay } from '~/utils/dates'
import { todayISO } from '~~/shared/window'

const route = useRoute()
const slug = computed(() => String(route.params.slug))

const station = computed(() => stationBySlug(slug.value))
if (!station.value) {
  throw createError({ statusCode: 404, statusMessage: 'Gare inconnue', fatal: true })
}

const name = computed(() => cityName(slug.value))
const appLink = computed(() => `/app?origin=${encodeURIComponent(station.value!.label)}`)
const statsLink = computed(() => `/stats?origin=${encodeURIComponent(station.value!.label)}`)

const { data: departures } = await useDestinations(station.value!.label)

const destinations = computed(() => departures.value?.destinations ?? [])
const openDays = computed(() => departures.value?.openDays.length ?? 0)
const widest = computed(() => destinations.value[0] ?? null)
const soonest = computed(() => departures.value?.openDays[0] ?? null)

/** Same split as a liaison page: a few cards to look at, the tail as plain rows. */
const HIGHLIGHTED = 8
const featured = computed(() => destinations.value.slice(0, HIGHLIGHTED))
const rest = computed(() => destinations.value.slice(HIGHLIGHTED))

/**
 * How much of the coming week a destination is open.
 *
 * The cards would otherwise all repeat the same next date — on the widest liaisons it is
 * today — and say nothing that tells one from another.
 */
const weekEnd = computed(() => {
  const [y, m, d] = todayISO().split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + 6)).toISOString().slice(0, 10)
})
function daysThisWeek(days: string[]): number {
  return days.filter((d) => d <= weekEnd.value).length
}

/** The liaison page when the pair has one, the app on its next bookable day otherwise. */
function destinationLink(d: { label: string; slug: string | null; days: string[] }): string {
  if (d.slug && routeBySlugs(slug.value, d.slug)) return `/depuis/${slug.value}/vers/${d.slug}`
  const query = new URLSearchParams({
    origin: station.value!.label,
    destination: d.label,
    date: d.days[0]!,
    mode: 'route',
    stops: '2',
  })
  return `/app?${query}`
}

const others = computed(() => {
  const i = STATION_PAGES.findIndex((s) => s.slug === slug.value)
  const pool = [...STATION_PAGES.slice(i + 1), ...STATION_PAGES.slice(0, i)]
  return pool.slice(0, 12)
})

const { public: { siteUrl } } = useRuntimeConfig()
const canonical = computed(() => `${siteUrl.replace(/\/$/, '')}/depuis/${slug.value}`)

const title = computed(() => seoTitle(`TGVmax depuis ${name.value}`))
const description = computed(() => {
  const count = destinations.value.length
  if (!count) {
    return seoDescription(
      `Toutes les destinations TGVmax (MAX JEUNE) réservables depuis ${name.value}, sur une carte.`,
      `Aller-retour week-end, dates de retour, itinéraires avec correspondances.`,
      `Gratuit, sans compte.`,
    )
  }
  return seoDescription(
    `${count} ${count > 1 ? 'destinations réservables' : 'destination réservable'} en TGVmax `
    + `(MAX JEUNE) depuis ${name.value} sur les trente prochains jours.`,
    `${widest.value!.days.length} jours sur trente pour ${prettyLabel(widest.value!.label)}.`,
    `Carte, dates et horaires.`,
    `Gratuit, sans compte.`,
  )
})

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
    <SiteHeader />

    <main class="mx-auto max-w-4xl px-5 py-12 sm:px-8">
      <nav aria-label="Fil d'ariane" class="mb-6 text-sm text-rail-soft">
        <NuxtLink to="/" class="hover:text-rail">Accueil</NuxtLink>
        <span class="mx-1.5">/</span>
        <span class="text-rail">Depuis {{ name }}</span>
      </nav>

      <h1 class="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
        Destinations <span class="text-accent-strong">TGVmax</span> depuis {{ name }}
      </h1>

      <p class="mt-4 max-w-2xl text-lg text-rail-soft">
        Où partir depuis {{ name }} avec votre abonnement TGVmax (MAX JEUNE) ?
        <template v-if="destinations.length">
          Voici les gares où il reste des places, du plus souvent réservable au plus rare.
        </template>
        <template v-else>
          Choisissez une date, et toutes les destinations où il reste des places réservables
          apparaissent sur une carte.
        </template>
      </p>

      <section class="mt-8 overflow-hidden rounded-2xl bg-rail px-6 py-7 text-white">
        <div class="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-[11px] font-semibold tracking-[0.12em] text-accent uppercase">
              Sur les trente prochains jours
            </p>
            <h2 class="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
              <template v-if="destinations.length">
                {{ destinations.length }}
                {{ destinations.length > 1 ? 'destinations réservables' : 'destination réservable' }}
              </template>
              <template v-else>Où partir depuis {{ name }} ?</template>
            </h2>
            <p v-if="destinations.length" class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/70">
              <span>réparties sur <b class="font-semibold text-white">{{ openDays }}</b> journées</span>
              <span>la plus ouverte
                <b class="font-semibold text-white">{{ prettyLabel(widest!.label) }}</b>,
                {{ widest!.days.length }} jours</span>
              <span v-if="soonest">dès
                <b class="font-semibold text-white">
                  <time :datetime="soonest">{{ humanDay(soonest, { weekday: true }) }}</time>
                </b></span>
            </p>
            <p v-else class="mt-3 max-w-lg text-sm text-white/70">
              Choisissez une date, et toutes les gares où il reste des places TGVmax apparaissent
              sur une carte.
            </p>
          </div>
          <div class="flex shrink-0 flex-col gap-2 sm:w-56">
            <NuxtLink
              :to="appLink"
              class="rounded-xl bg-coral-strong px-4 py-3 text-center text-sm font-semibold text-white transition hover:bg-coral-ink"
            >Voir la carte des destinations</NuxtLink>
            <NuxtLink
              :to="`${appLink}&mode=roundtrip`"
              class="rounded-xl px-4 py-3 text-center text-sm font-semibold text-accent ring-1 ring-accent/40 transition hover:bg-white/5"
            >Chercher un aller-retour week-end</NuxtLink>
          </div>
        </div>
      </section>

      <section v-if="featured.length" class="mt-14">
        <h2 class="text-xl font-bold sm:text-2xl">Les destinations les plus ouvertes</h2>
        <p class="mt-3 max-w-2xl text-rail-soft">
          Celles dont les places reviennent le plus souvent sur la fenêtre. Un clic ouvre la
          liaison, ou la journée dans l'application.
        </p>
        <ul class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <li v-for="d in featured" :key="d.label">
            <NuxtLink
              :to="destinationLink(d)"
              data-test="open-destination"
              class="block h-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-accent hover:shadow-md"
            >
              <p class="font-display font-bold text-accent-strong">
                <span class="block text-[10px] font-medium tracking-wider text-rail-soft uppercase">
                  {{ d.days.length }} jours / 30
                </span>
                <span class="block">{{ prettyLabel(d.label) }} →</span>
              </p>
              <p class="mt-1 text-xs text-rail-soft tabular-nums">
                <template v-if="daysThisWeek(d.days)">
                  {{ daysThisWeek(d.days) }} jours cette semaine
                </template>
                <template v-else>
                  dès le <time :datetime="d.days[0]">{{ humanDay(d.days[0]!) }}</time>
                </template>
              </p>
            </NuxtLink>
          </li>
        </ul>
      </section>

      <section v-if="rest.length" class="mt-14">
        <h2 class="text-xl font-bold sm:text-2xl">Les autres destinations depuis {{ name }}</h2>
        <p class="mt-3 max-w-2xl text-rail-soft">
          De la plus souvent réservable à la plus rare, avec sa prochaine date.
        </p>
        <div class="mt-4 grid gap-x-8 rounded-xl bg-slate-100/70 px-4 py-1 sm:grid-cols-2">
          <NuxtLink
            v-for="d in rest"
            :key="d.label"
            :to="destinationLink(d)"
            data-test="open-destination"
            class="flex items-baseline justify-between gap-3 border-b border-slate-200/70 py-2.5 text-sm last:border-0"
          >
            <span class="min-w-0 truncate font-medium text-accent-strong hover:underline">
              {{ prettyLabel(d.label) }}
            </span>
            <span class="shrink-0 text-xs text-rail-soft tabular-nums">
              {{ d.days.length }} j · dès le
              <time :datetime="d.days[0]">{{ humanDay(d.days[0]!) }}</time>
            </span>
          </NuxtLink>
        </div>
      </section>

      <div class="mt-14 grid gap-3 sm:grid-cols-2">
        <section class="rounded-xl border border-slate-200 bg-white p-4">
          <h2 class="font-display text-lg font-bold">L'offre depuis {{ name }}, en chiffres</h2>
          <p class="mt-2 text-sm text-rail-soft">
            Quels jours et à quelles heures partent les trains, et sur quelles liaisons l'offre se
            concentre, sur les seuls départs de {{ name }}.
          </p>
          <NuxtLink
            :to="statsLink"
            class="mt-3 inline-block text-sm font-medium text-accent-strong hover:underline"
          >Voir les statistiques TGVmax depuis {{ name }}</NuxtLink>
        </section>

        <section class="rounded-xl border border-slate-200 bg-white p-4">
          <h2 class="font-display text-lg font-bold">Partir d'une autre gare</h2>
          <p class="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-sm">
            <NuxtLink
              v-for="s in others"
              :key="s.slug"
              :to="`/depuis/${s.slug}`"
              class="font-medium text-accent-strong hover:underline"
            >{{ cityName(s.slug) }}</NuxtLink>
          </p>
          <NuxtLink
            to="/liaisons"
            class="mt-3 inline-block text-sm font-medium text-rail-soft hover:text-rail hover:underline"
          >Toutes les liaisons TGVmax</NuxtLink>
        </section>
      </div>

    </main>

    <SiteFooter />
  </div>
</template>
