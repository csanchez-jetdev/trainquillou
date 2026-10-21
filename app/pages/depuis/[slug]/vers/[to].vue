<script setup lang="ts">
import { cityName, prettyLabel, routeBySlugs, routesFrom, stationBySlug } from '~~/shared/stations'
import { seoDescription, seoTitle } from '~~/shared/seo'
import { sncfConnectUrl, trainlineUrl } from '~/utils/booking'
import { formatDuration, tripDurationMin } from '~/utils/trains'
import { dayNumber, humanDay, shortWeekday } from '~/utils/dates'
import { todayISO } from '~~/shared/window'

const route = useRoute()
const fromSlug = computed(() => String(route.params.slug))
const toSlug = computed(() => String(route.params.to))

const pair = computed(() => routeBySlugs(fromSlug.value, toSlug.value))
const from = computed(() => stationBySlug(fromSlug.value))
const to = computed(() => stationBySlug(toSlug.value))
if (!pair.value || !from.value || !to.value) {
  throw createError({ statusCode: 404, statusMessage: 'Liaison inconnue', fatal: true })
}

const fromName = computed(() => cityName(fromSlug.value))
const toName = computed(() => cityName(toSlug.value))

const { data: liaison, error: liaisonError } = await useLiaison(from.value!.label, to.value!.label)

// Sans réponse de l'API, la page rendrait son état vide — c'est-à-dire affirmerait qu'aucun
// TGVmax ne circule, ce qu'elle ne sait pas. Un 503 dit « repassez », un mensonge non.
if (liaisonError.value || !liaison.value) {
  throw createError({
    statusCode: 503,
    statusMessage: 'Disponibilités momentanément indisponibles',
    fatal: true,
  })
}

const days = computed(() => liaison.value?.days ?? [])
const next = computed(() => liaison.value?.next ?? null)
const trains = computed(() => next.value?.trains ?? [])
const fastest = computed(() =>
  days.value.length ? Math.min(...days.value.map((d) => d.fastestMin)) : null,
)
const reverse = computed(() => routeBySlugs(toSlug.value, fromSlug.value))
const siblings = computed(() => routesFrom(fromSlug.value).filter((r) => r.to !== toSlug.value))

/**
 * The next bookable days, with the unavailable ones left in place between them.
 *
 * A list of bookable dates hides its gaps: three missing Sundays in a row read as a jump in
 * numbers. The strip stops on the twelfth bookable day rather than at a fixed horizon, so a
 * liaison open nine days out of thirty does not end in a fortnight of empty cells.
 */
const STRIP_DAYS = 12
const STRIP_MAX = 28
const strip = computed(() => {
  const byDate = new Map(days.value.map((d) => [d.date, d]))
  const last = days.value[Math.min(STRIP_DAYS, days.value.length) - 1]
  if (!last) return []
  const [y, m, d] = todayISO().split('-').map(Number)
  const cells: { date: string; day: (typeof days.value)[number] | null }[] = []
  for (let i = 0; i < STRIP_MAX; i++) {
    const date = new Date(Date.UTC(y!, m! - 1, d! + i)).toISOString().slice(0, 10)
    cells.push({ date, day: byDate.get(date) ?? null })
    if (date >= last.date) break
  }
  return cells
})

/**
 * Two connections allowed even on a day this page lists for its directs: the app keeps the
 * setting when the visitor moves the date, and directs-only answers nothing most days.
 */
function appLink(date: string): string {
  const query = new URLSearchParams({
    origin: from.value!.label,
    destination: to.value!.label,
    date,
    mode: 'route',
    stops: '2',
  })
  return `/app?${query}`
}

const connectionLink = computed(() => appLink(todayISO()))

function onBook(provider: 'sncf_connect' | 'trainline') {
  track('booking_click', { provider, destination: to.value!.label, mode: 'liaison' })
}

function onPickDay(date: string) {
  track('date_pick', { source: 'liaison', horizon: horizonDays(date) })
}

const { public: { siteUrl } } = useRuntimeConfig()
const base = siteUrl.replace(/\/$/, '')
const canonical = computed(() => `${base}/depuis/${fromSlug.value}/vers/${toSlug.value}`)

/**
 * Share image, drawn by the API from the same window the page shows.
 *
 * The date in the URL is the cache buster the social networks need: they keep their own copy
 * of whatever they scraped, and would otherwise show yesterday's figures for weeks.
 */
const ogImage = computed(() => {
  const query = new URLSearchParams({
    origin: from.value!.label,
    dest: to.value!.label,
    from: todayISO(),
  })
  return `${base}/api/og.png?${query}`
})

const title = computed(() => seoTitle(`TGVmax ${fromName.value} → ${toName.value}`))
const description = computed(() => {
  const count = days.value.length
  if (!count) {
    return seoDescription(
      `Aucune place TGVmax directe de ${fromName.value} à ${toName.value} sur les 30 prochains jours.`,
      `Les itinéraires avec correspondance et les dates de retour, mis à jour chaque matin.`,
    )
  }
  return seoDescription(
    `${count} ${count > 1 ? 'dates réservables' : 'date réservable'} en TGVmax (MAX JEUNE) de `
    + `${fromName.value} à ${toName.value}.`,
    `La prochaine ${humanDay(next.value!.date, { weekday: true })}.`,
    `Horaires, durée du trajet et dates de retour.`,
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
    { property: 'og:image', content: ogImage.value },
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    {
      property: 'og:image:alt',
      content: `TGVmax ${fromName.value} → ${toName.value}, prochaines dates réservables`,
    },
    { name: 'twitter:image', content: ogImage.value },
    { name: 'twitter:title', content: title.value },
    { name: 'twitter:description', content: description.value },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: base },
          {
            '@type': 'ListItem',
            position: 2,
            name: `Depuis ${fromName.value}`,
            item: `${base}/depuis/${fromSlug.value}`,
          },
          { '@type': 'ListItem', position: 3, name: `Vers ${toName.value}`, item: canonical.value },
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
        <NuxtLink to="/liaisons" class="hover:text-rail">Liaisons</NuxtLink>
        <span class="mx-1.5">/</span>
        <NuxtLink :to="`/depuis/${fromSlug}`" class="hover:text-rail">Depuis {{ fromName }}</NuxtLink>
        <span class="mx-1.5">/</span>
        <span class="text-rail">Vers {{ toName }}</span>
      </nav>

      <h1 class="font-display text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
        <span class="text-accent-strong">TGVmax</span> {{ fromName }} → {{ toName }}
      </h1>

      <p v-if="days.length" class="mt-4 max-w-2xl text-lg text-rail-soft">
        Il reste des places sur <strong class="text-rail">{{ days.length }}</strong> des trente
        prochains jours<span v-if="fastest">, en
          <strong class="text-rail">{{ formatDuration(fastest) }}</strong> pour le trajet le plus
          rapide</span>. Le retour est réservable sur
        <strong class="text-rail">{{ liaison!.returnDates.length }}</strong> jours.
      </p>
      <p v-else class="mt-4 max-w-2xl text-lg text-rail-soft">
        Aucun TGVmax direct entre {{ fromName }} et {{ toName }} sur les trente prochains jours.
        C'est fréquent sur cette liaison : le contingent à 0 € n'y est pas ouvert tous les jours.
        Reste la correspondance.
      </p>

      <section v-if="next" class="mt-8 overflow-hidden rounded-2xl bg-rail px-6 py-7 text-white">
        <div class="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-[11px] font-semibold tracking-[0.12em] text-accent uppercase">
              Prochain jour réservable
            </p>
            <h2 class="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
              <time :datetime="next.date">{{ humanDay(next.date, { weekday: true }) }}</time>
            </h2>
            <p class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/70">
              <span><b class="font-semibold text-white">{{ trains.length }}</b>
                {{ trains.length > 1 ? 'trains directs' : 'train direct' }}</span>
              <span v-if="trains[0]">premier à
                <b class="font-semibold tabular-nums text-white">{{ trains[0].departure }}</b></span>
              <span v-if="fastest">le plus rapide
                <b class="font-semibold text-white">{{ formatDuration(fastest) }}</b></span>
            </p>
          </div>
          <div class="flex shrink-0 flex-col gap-2 sm:w-56">
            <a
              :href="sncfConnectUrl(fromSlug, toSlug)"
              target="_blank"
              rel="noopener"
              data-test="liaison-book-sncf"
              class="rounded-xl bg-sncf px-4 py-3 text-center text-sm font-semibold ring-1 ring-white/20 transition hover:bg-sncf-hover"
              @click="onBook('sncf_connect')"
            >Réserver sur SNCF Connect</a>
            <a
              :href="trainlineUrl(fromSlug, toSlug)"
              target="_blank"
              rel="noopener"
              data-test="liaison-book-trainline"
              class="rounded-xl bg-trainline px-4 py-3 text-center text-sm font-semibold transition hover:bg-trainline-hover"
              @click="onBook('trainline')"
            >Réserver sur Trainline</a>
            <NuxtLink
              :to="appLink(next.date)"
              class="rounded-xl px-4 py-3 text-center text-sm font-semibold text-accent ring-1 ring-accent/40 transition hover:bg-white/5"
              @click="onPickDay(next.date)"
            >Voir la journée sur la carte</NuxtLink>
          </div>
        </div>
      </section>

      <section v-if="strip.length" class="mt-14">
        <h2 class="text-xl font-bold sm:text-2xl">Les jours suivants</h2>
        <p class="mt-3 text-rail-soft">
          Un clic ouvre la journée dans l'application, avec ses horaires et sa carte.
          <template v-if="strip.some((c) => !c.day)">
            Les jours en pointillé n'ont aucun direct : ils gardent leur place plutôt que de
            disparaître de la liste.
          </template>
        </p>
        <ul class="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          <li v-for="cell in strip" :key="cell.date">
            <NuxtLink
              v-if="cell.day"
              :to="appLink(cell.date)"
              data-test="liaison-day"
              class="block rounded-xl border border-slate-200 bg-white px-3 py-2.5 transition hover:border-accent hover:shadow-md"
              @click="onPickDay(cell.date)"
            >
              <p class="font-display font-bold text-accent-strong">
                <span class="block text-[10px] font-medium tracking-wider text-rail-soft uppercase">
                  {{ shortWeekday(cell.date) }}
                </span>
                <time :datetime="cell.date">{{ dayNumber(cell.date) }}</time> →
              </p>
              <p class="mt-1 text-xs text-rail-soft tabular-nums">
                <b :class="['font-semibold', cell.day.trains > 1 ? 'text-rail' : 'text-coral-ink']">
                  {{ cell.day.trains }}
                </b>
                {{ cell.day.trains > 1 ? 'directs' : 'direct' }} · dès
                {{ formatDuration(cell.day.fastestMin) }}<br>
                premier {{ cell.day.first }}
              </p>
            </NuxtLink>
            <div
              v-else
              class="rounded-xl border border-dashed border-slate-200 px-3 py-2.5 text-slate-500"
            >
              <p class="font-display font-bold">
                <span class="block text-[10px] font-medium tracking-wider uppercase">
                  {{ shortWeekday(cell.date) }}
                </span>
                <time :datetime="cell.date">{{ dayNumber(cell.date) }}</time>
              </p>
              <p class="mt-1 text-xs">Aucun direct</p>
            </div>
          </li>
        </ul>
      </section>

      <section v-if="trains.length && next" class="mt-14">
        <h2 class="text-xl font-bold sm:text-2xl">
          Les horaires du {{ humanDay(next.date, { weekday: true }) }}
        </h2>
        <!-- Ces lignes ne mènent nulle part : elles n'ont donc ni cadre ni ombre. -->
        <div class="mt-4 grid gap-x-8 rounded-xl bg-slate-100/70 px-4 py-1 sm:grid-cols-2">
          <p
            v-for="t in trains"
            :key="`${t.departure}-${t.arrival}-${t.trainNumber}`"
            class="flex items-baseline justify-between gap-3 border-b border-slate-200/70 py-2.5 text-sm last:border-0"
          >
            <b class="font-semibold tabular-nums">{{ t.departure }} → {{ t.arrival }}</b>
            <span class="shrink-0 text-xs text-rail-soft tabular-nums">
              {{ formatDuration(tripDurationMin(t)) }}<span v-if="t.trainNumber"> · n° {{ t.trainNumber }}</span>
            </span>
          </p>
        </div>
      </section>

      <section v-if="liaison!.connections.length" class="mt-14">
        <h2 class="text-xl font-bold sm:text-2xl">Y aller avec une correspondance</h2>
        <p class="mt-3 text-rail-soft">
          Faute de direct, l'itinéraire se compose de plusieurs TGVmax. Le plus court trouvé
          aujourd'hui :
        </p>
        <ol class="mt-4 space-y-2">
          <li
            v-for="(leg, i) in liaison!.connections[0]!.legs"
            :key="i"
            class="rounded-xl border border-slate-200 bg-white px-4 py-3"
          >
            <span class="font-medium">{{ prettyLabel(leg.from) }} → {{ prettyLabel(leg.to) }}</span>
            <span class="ml-2 text-sm tabular-nums text-rail-soft">{{ leg.departure }} → {{ leg.arrival }}</span>
          </li>
        </ol>
        <NuxtLink
          :to="connectionLink"
          class="mt-4 inline-block font-medium text-accent-strong underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          Chercher d'autres itinéraires {{ fromName }} → {{ toName }}
        </NuxtLink>
      </section>

      <div class="mt-14 grid gap-3 sm:grid-cols-2">
        <section v-if="liaison!.returnDates.length" class="rounded-xl border border-slate-200 bg-white p-4">
          <h2 class="font-display text-lg font-bold">Rentrer de {{ toName }}</h2>
          <p class="mt-2 text-sm text-rail-soft">
            Réservable sur {{ liaison!.returnDates.length }}
            {{ liaison!.returnDates.length > 1 ? 'jours' : 'jour' }}, à partir du
            <time :datetime="liaison!.returnDates[0]">
              {{ humanDay(liaison!.returnDates[0]!, { weekday: true }) }}
            </time>.
          </p>
          <NuxtLink
            v-if="reverse"
            :to="`/depuis/${toSlug}/vers/${fromSlug}`"
            class="mt-3 inline-block text-sm font-medium text-accent-strong hover:underline"
          >Voir la liaison {{ toName }} → {{ fromName }}</NuxtLink>
        </section>

        <section v-if="siblings.length" class="rounded-xl border border-slate-200 bg-white p-4">
          <h2 class="font-display text-lg font-bold">Depuis {{ fromName }} aussi</h2>
          <p class="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-sm">
            <NuxtLink
              v-for="r in siblings"
              :key="r.to"
              :to="`/depuis/${r.from}/vers/${r.to}`"
              class="font-medium text-accent-strong hover:underline"
            >{{ cityName(r.to) }}</NuxtLink>
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
