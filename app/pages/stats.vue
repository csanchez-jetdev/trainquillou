<script setup lang="ts">
import type { StatsResult } from '~~/shared/types'
import type { Bar } from '~/components/ChartBars.vue'
import type { Cell } from '~/components/HeatGrid.vue'

import { isKnownStation } from '~~/shared/normalize'
import { prettyLabel } from '~~/shared/stations'

const { public: { siteUrl } } = useRuntimeConfig()
const base = siteUrl.replace(/\/$/, '')

const route = useRoute()
const router = useRouter()

const origin = computed(() => {
  const value = route.query.origin
  return typeof value === 'string' ? value.trim() : ''
})
const scope = computed(() => (origin.value ? prettyLabel(origin.value) : ''))

const title = computed(() =>
  scope.value
    ? `Statistiques TGVmax depuis ${scope.value} — offre, horaires et destinations`
    : 'Statistiques TGVmax — quelle part de l\'offre est réservable, et quand',
)
const description = computed(() =>
  scope.value
    ? `Combien de destinations TGVmax / MAX JEUNE sont réservables depuis ${scope.value}, à `
      + 'quelles heures et quels jours partent les trains, et sur quelles liaisons l\'offre se '
      + 'concentre. Chiffres calculés sur l\'open data SNCF, mis à jour chaque jour.'
    : 'Quelle part des trains publiés par la SNCF est réservable avec TGVmax / MAX JEUNE, '
      + 'comment elle varie selon le jour de départ, l\'axe et l\'heure, et sur quelles liaisons '
      + 'l\'offre se concentre. Chiffres calculés sur l\'open data SNCF, mis à jour chaque jour.',
)

const { data: stats, pending, error } = useAsyncData<StatsResult>(
  'stats',
  // Without the timeout, a backend that answers nothing leaves the spinner turning for good.
  () => $fetch<StatsResult>('/api/stats', {
    query: origin.value ? { origin: origin.value } : undefined,
    timeout: 10_000,
  }),
  { server: false, lazy: true, watch: [origin] },
)

// After the fetch: `useHead` runs its getter at once, and a `const` declared below throws.
useHead(() => ({
  title: title.value,
  link: [{ rel: 'canonical', href: `${base}/stats` }],
  meta: [
    { name: 'description', content: description.value },
    { property: 'og:title', content: title.value },
    { property: 'og:description', content: description.value },
    { property: 'og:url', content: `${base}/stats` },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: base },
          { '@type': 'ListItem', position: 2, name: 'Statistiques', item: `${base}/stats` },
        ],
      }),
    },
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Dataset',
        name: 'Disponibilité des places TGVmax / MAX JEUNE, comptée par jour, axe et heure',
        description: 'Comptages quotidiens dérivés du jeu de données open data SNCF « tgvmax » : '
          + 'part des trains publiés ouvrant une place d\'abonnement, répartition des offres '
          + 'réservables par jour de départ, heure, durée et liaison, et suivi des places qui '
          + 'disparaissent d\'un relevé au suivant.',
        url: `${base}/stats`,
        inLanguage: 'fr',
        isAccessibleForFree: true,
        license: 'https://www.etalab.gouv.fr/licence-ouverte-open-licence',
        creator: { '@type': 'Organization', name: 'Trainquillou', url: base },
        spatialCoverage: 'France',
        temporalCoverage: stats.value
          ? `${stats.value.window.first}/${stats.value.window.last}`
          : undefined,
        ...(stats.value ? { dateModified: stats.value.updatedOn } : {}),
        isBasedOn: 'https://ressources.data.sncf.com/explore/dataset/tgvmax/',
        variableMeasured: [
          'Trains publiés',
          'Offres réservables avec l\'abonnement',
          'Part éligible par axe commercial',
          'Offres par jour de départ, jour de la semaine et heure',
        ],
      }),
    },
  ],
}))

const { stations } = useStations()

const typed = ref(origin.value)
watch(origin, (value) => (typed.value = value))

function scopeTo(label: string) {
  typed.value = label
  if (label && !isKnownStation(label, stations.value)) return
  const query = label ? { origin: label } : {}
  router.push({ query })
}

const SHORTCUTS = [
  'PARIS (intramuros)',
  'LYON (intramuros)',
  'BORDEAUX ST JEAN',
  'MARSEILLE ST CHARLES',
  'LILLE (intramuros)',
  'NANTES',
]

const count = new Intl.NumberFormat('fr-FR')
const share = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 1 })
const rounded = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 })

/** Parsed field by field: `new Date('2026-08-03')` is UTC midnight, a day off west of London. */
function day(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' }) {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('fr-FR', opts)
}

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']

const eligibility = computed(() => {
  const c = stats.value?.coverage
  return c && c.total ? c.eligible / c.total : null
})

const ratios = computed(() => {
  const daily = stats.value?.coverage?.daily ?? []
  return daily.map((d) => ({ ...d, ratio: d.total ? d.eligible / d.total : 0 }))
})

const ratioExtremes = computed(() => {
  if (!ratios.value.length) return null
  const sorted = [...ratios.value].sort((a, b) => b.ratio - a.ratio)
  return { best: sorted[0]!, worst: sorted.at(-1)! }
})

const ratioPath = computed(() => {
  const points = ratios.value
  if (points.length < 2) return null
  const top = Math.max(...points.map((p) => p.ratio))
  const scale = top > 0 ? Math.ceil(top * 10) / 10 : 1
  const [left, right, floor, ceiling] = [40, 594, 148, 14]
  const x = (i: number) => left + (i / (points.length - 1)) * (right - left)
  const y = (ratio: number) => floor - (ratio / scale) * (floor - ceiling)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.ratio).toFixed(1)}`)
  return {
    line: line.join(' '),
    area: `${line.join(' ')} L${right} ${floor} L${left} ${floor} Z`,
    left,
    right,
    ticks: [scale, scale / 2, 0].map((value) => ({ value, y: y(value) })),
    dots: [points[0]!, points.at(-1)!].map((p, i) => ({
      cx: i ? right : left,
      cy: y(p.ratio),
      date: p.date,
    })),
  }
})

const allAxisStations = computed<[number, number][]>(() => {
  const seen = new Map<string, [number, number]>()
  for (const axis of stats.value?.coverage?.axes ?? []) {
    for (const station of axis.stations) seen.set(String(station), station)
  }
  return [...seen.values()]
})

const axisBars = computed<Bar[]>(() =>
  (stats.value?.coverage?.axes ?? []).map((axis) => ({
    key: axis.label,
    label: axis.label,
    value: axis.total ? (axis.eligible / axis.total) * 100 : 0,
    display: rounded.format(axis.total ? axis.eligible / axis.total : 0),
    full: `${axis.label} — ${count.format(axis.eligible)} offres éligibles sur ${count.format(axis.total)}`,
  })),
)

const weekdayBars = computed<Bar[]>(() =>
  (stats.value?.weekdays ?? []).map((entry) => {
    const perDay = entry.days ? Math.round(entry.offers / entry.days) : 0
    return {
      key: String(entry.weekday),
      label: WEEKDAYS[entry.weekday - 1]?.slice(0, 3) ?? '',
      value: perDay,
      display: count.format(perDay),
      full: WEEKDAYS[entry.weekday - 1] ?? '',
    }
  }),
)

const bestWeekday = computed(() =>
  [...weekdayBars.value].sort((a, b) => b.value - a.value)[0] ?? null,
)
const worstWeekday = computed(() =>
  [...weekdayBars.value].sort((a, b) => a.value - b.value)[0] ?? null,
)

const hourBars = computed<Bar[]>(() => {
  const byHour = new Map((stats.value?.hourly ?? []).map((h) => [h.hour, h.offers]))
  return Array.from({ length: 24 }, (_, hour) => ({
    key: String(hour),
    label: `${hour}h`,
    value: byHour.get(hour) ?? 0,
    display: count.format(byHour.get(hour) ?? 0),
    full: `départs de ${hour}h à ${hour}h59`,
  }))
})

const busiestHour = computed(() => [...hourBars.value].sort((a, b) => b.value - a.value)[0] ?? null)

const gridCells = computed<Cell[]>(() =>
  (stats.value?.weeklyGrid ?? []).map((cell) => {
    const perDay = cell.days ? cell.offers / cell.days : 0
    return {
      weekday: cell.weekday,
      hour: cell.hour,
      value: perDay,
      display: `${count.format(Math.round(perDay))} offres par ${WEEKDAYS[cell.weekday - 1]}`,
    }
  }),
)

const busiestSlot = computed(() => [...gridCells.value].sort((a, b) => b.value - a.value)[0] ?? null)

const DURATION_LABELS: Record<string, string> = {
  t1: 'moins de 1h30',
  t2: 'de 1h30 à 3h',
  t3: 'de 3h à 4h30',
  t4: 'plus de 4h30',
}

const durationBars = computed<Bar[]>(() =>
  (stats.value?.durations ?? []).map((band) => ({
    key: band.band,
    label: DURATION_LABELS[band.band] ?? band.band,
    value: band.offers,
    display: count.format(band.offers),
    color: `--color-${band.band}`,
  })),
)

const shortShare = computed(() => {
  const bands = stats.value?.durations ?? []
  const short = bands.find((b) => b.band === 't1')?.offers ?? 0
  const total = bands.reduce((sum, b) => sum + b.offers, 0)
  return total ? short / total : 0
})

const dailyBars = computed<Bar[]>(() =>
  (stats.value?.daily ?? []).map((entry) => ({
    key: entry.date,
    label: day(entry.date, { day: 'numeric', month: 'short' }),
    value: entry.offers,
    display: count.format(entry.offers),
    full: day(entry.date, { weekday: 'long', day: 'numeric', month: 'long' }),
  })),
)

const dailyPeak = computed(() => [...dailyBars.value].sort((a, b) => b.value - a.value)[0] ?? null)

const averagePerDay = computed(() => {
  if (!stats.value?.daily.length) return 0
  return Math.round(stats.value.offers / stats.value.daily.length)
})

const runs = computed(() => stats.value?.history.runs ?? [])
const lastRun = computed(() => runs.value.at(-1) ?? null)

const attrition = computed(() => {
  const run = lastRun.value
  return run?.observed ? run.vanished / run.observed : null
})

const churnBars = computed<Bar[]>(() =>
  runs.value.map((run) => ({
    key: run.date,
    label: day(run.date, { day: 'numeric', month: 'short' }),
    value: run.vanished,
    display: count.format(run.vanished),
    full: `${day(run.date)} · ${count.format(run.vanished)} parties, ${count.format(run.created)} nouvelles`,
  })),
)

const leadBars = computed<Bar[]>(() => {
  const byDay = new Map((stats.value?.history.leadTimes ?? []).map((l) => [l.days, l.soldOut]))
  if (!byDay.size) return []
  const span = Math.max(...byDay.keys())
  return Array.from({ length: span + 1 }, (_, index) => {
    const days = span - index
    return {
      key: String(days),
      label: days ? `J−${days}` : 'départ',
      value: byDay.get(days) ?? 0,
      display: count.format(byDay.get(days) ?? 0),
      full: days ? `${days} jour${days > 1 ? 's' : ''} avant le départ` : 'le jour du départ',
    }
  })
})

const medianLead = computed(() => {
  const entries = stats.value?.history.leadTimes ?? []
  const total = entries.reduce((sum, entry) => sum + entry.soldOut, 0)
  if (!total) return null
  let seen = 0
  for (const entry of entries) {
    seen += entry.soldOut
    if (seen >= total / 2) return entry.days
  }
  return null
})
</script>

<template>
  <div class="min-h-[100dvh] bg-cream text-rail">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-5xl items-center justify-between px-5 py-4 sm:px-8">
        <NuxtLink to="/" class="flex items-center gap-2 font-bold tracking-tight text-rail">
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

    <main class="mx-auto max-w-5xl px-5 py-12 sm:px-8">
      <nav aria-label="Fil d'ariane" class="mb-6 text-sm text-rail-soft">
        <NuxtLink to="/" class="hover:text-rail">Accueil</NuxtLink>
        <span class="mx-1.5">/</span>
        <NuxtLink v-if="scope" to="/stats" class="hover:text-rail">Statistiques</NuxtLink>
        <span v-else class="text-rail">Statistiques</span>
        <template v-if="scope">
          <span class="mx-1.5">/</span>
          <span class="text-rail">{{ scope }}</span>
        </template>
      </nav>

      <h1 class="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
        <template v-if="scope">L'offre TGVmax <span class="text-accent-strong">depuis {{ scope }}</span></template>
        <template v-else>L'offre TGVmax <span class="text-accent-strong">en chiffres</span></template>
      </h1>

      <p v-if="scope" class="mt-5 max-w-3xl text-lg leading-relaxed text-rail-soft">
        Les mêmes chiffres que sur toute la France, comptés sur les seuls trains qui partent de
        {{ scope }} : où ils mènent, quels jours et à quelles heures ils partent.
      </p>
      <p v-else class="mt-5 max-w-3xl text-lg leading-relaxed text-rail-soft">
        La SNCF publie chaque jour tous ses trains à réservation, et pour chacun un indicateur :
        des places d'abonnement y sont ouvertes, ou non. Cette page compte les deux. Elle dit donc
        non seulement où l'abonnement mène, mais
        <strong class="text-rail">quelle part de l'offre ferroviaire il ouvre vraiment</strong>.
      </p>

      <section
        aria-label="Gare de départ"
        class="mt-8 rounded-2xl border border-slate-200 bg-white p-4"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div class="rounded-xl border border-slate-200 sm:w-80">
            <StationInput
              :model-value="typed"
              label="Départ"
              placeholder="Toute la France"
              @update:model-value="scopeTo"
            />
          </div>
          <p class="text-sm text-rail-soft">
            <template v-if="scope">
              Chiffres limités aux départs de {{ scope }}.
              <button type="button" class="font-medium text-accent-strong hover:underline" @click="scopeTo('')">
                Revenir à toute la France
              </button>
            </template>
            <template v-else>Choisissez une gare pour ne compter que ses départs.</template>
          </p>
        </div>
        <ul class="mt-3 flex flex-wrap gap-2">
          <li v-for="shortcut in SHORTCUTS" :key="shortcut">
            <button
              type="button"
              :aria-pressed="origin === shortcut"
              class="rounded-lg px-3 py-1.5 text-xs font-medium transition"
              :class="origin === shortcut
                ? 'bg-rail text-white'
                : 'bg-slate-100 text-rail-soft hover:bg-slate-200'"
              @click="scopeTo(origin === shortcut ? '' : shortcut)"
            >
              {{ prettyLabel(shortcut) }}
            </button>
          </li>
        </ul>
      </section>

      <ClientOnly>
        <template #fallback>
          <p class="mt-10 flex items-center gap-3 text-rail-soft">
            <Spinner :size="20" />
            Calcul des chiffres…
          </p>
        </template>

        <p v-if="pending && !stats" class="mt-10 flex items-center gap-3 text-rail-soft">
          <Spinner :size="20" />
          Calcul des chiffres…
        </p>

        <p v-else-if="error || !stats" class="mt-10 rounded-2xl border border-slate-200 bg-white p-5 text-rail-soft">
          Les chiffres ne sont pas disponibles pour le moment. Ils sont recalculés après chaque
          ingestion quotidienne des données SNCF ; réessayez dans quelques minutes.
        </p>

        <div v-else :class="pending && 'pointer-events-none opacity-50'" class="transition-opacity">
          <p class="mt-4 text-sm text-rail-soft">
            Données ingérées le <strong class="text-rail">{{ day(stats.updatedOn) }}</strong>, pour
            les départs du {{ day(stats.window.first) }} au {{ day(stats.window.last) }}.
          </p>

          <section v-if="scope" class="mt-10 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 class="text-sm font-medium text-rail-soft">
              Gares réservables sans correspondance depuis {{ scope }}
            </h2>
            <p class="mt-2 text-5xl font-semibold leading-none tracking-tight sm:text-6xl">
              {{ count.format(stats.stations.served) }}
            </p>
            <p class="mt-4 max-w-2xl leading-relaxed text-rail-soft">
              Sur {{ count.format(stats.offers) }} offres réservables au départ de {{ scope }}
              pendant la fenêtre. La part éligible de l'offre publiée, elle, n'est disponible que
              par axe commercial, jamais par gare : elle reste sur
              <NuxtLink to="/stats" class="font-medium text-accent-strong hover:underline">
                la page nationale
              </NuxtLink>.
            </p>
          </section>

          <section v-else-if="eligibility !== null && stats.coverage" class="mt-10 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 class="text-sm font-medium text-rail-soft">
              Part des trains publiés où une place d'abonnement est ouverte
            </h2>
            <p class="mt-2 text-5xl font-semibold leading-none tracking-tight sm:text-6xl">
              {{ share.format(eligibility) }}
            </p>
            <p class="mt-4 max-w-2xl leading-relaxed text-rail-soft">
              Soit {{ count.format(stats.coverage.eligible) }} offres réservables avec
              l'abonnement, sur {{ count.format(stats.coverage.total) }} publiées par la SNCF sur
              la fenêtre. Le reste circule, mais sans place TGVmax à l'instant du relevé.
            </p>
          </section>

          <dl class="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div class="rounded-2xl border border-slate-200 bg-white p-5">
              <dt class="text-sm text-rail-soft">Liaisons desservies</dt>
              <dd class="mt-1 text-3xl font-semibold">{{ count.format(stats.routes) }}</dd>
              <p class="mt-1 text-xs text-rail-soft">couples de gares, sans correspondance</p>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-white p-5">
              <dt class="text-sm text-rail-soft">{{ scope ? 'Destinations' : 'Gares desservies' }}</dt>
              <dd class="mt-1 text-3xl font-semibold">{{ count.format(stats.stations.served) }}</dd>
              <p class="mt-1 text-xs text-rail-soft">sur {{ stats.stations.known }} connues du jeu de données</p>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-white p-5">
              <dt class="text-sm text-rail-soft">Offres réservables</dt>
              <dd class="mt-1 text-3xl font-semibold">{{ count.format(stats.offers) }}</dd>
              <p class="mt-1 text-xs text-rail-soft">une offre = un train, un jour, une liaison</p>
            </div>
            <div class="rounded-2xl border border-slate-200 bg-white p-5">
              <dt class="text-sm text-rail-soft">Offres par jour</dt>
              <dd class="mt-1 text-3xl font-semibold">{{ count.format(averagePerDay) }}</dd>
              <p class="mt-1 text-xs text-rail-soft">en moyenne sur les {{ stats.daily.length }} jours</p>
            </div>
          </dl>

          <section v-if="ratioPath && ratioExtremes" class="mt-14">
            <h2 class="text-2xl font-bold">Plus le départ est loin, moins il reste de places</h2>
            <p class="mt-3 max-w-3xl leading-relaxed text-rail-soft">
              La part éligible n'est pas la même d'un bout à l'autre de la fenêtre : elle vaut
              <strong class="text-rail">{{ share.format(ratioExtremes.best.ratio) }}</strong> le
              {{ day(ratioExtremes.best.date) }} et
              <strong class="text-rail">{{ share.format(ratioExtremes.worst.ratio) }}</strong> le
              {{ day(ratioExtremes.worst.date) }}. Les places d'abonnement n'ouvrent que 30 jours
              avant le départ : le bord lointain de la fenêtre vient tout juste de s'ouvrir, et se
              remplira dans les jours qui viennent.
            </p>

            <figure class="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
              <figcaption class="text-sm font-medium text-rail">
                Part éligible, par jour de départ
              </figcaption>
              <svg
                viewBox="0 0 600 170"
                class="mt-4 w-full"
                role="img"
                :aria-label="`Part éligible par jour de départ, de ${share.format(ratioExtremes.best.ratio)} le ${day(ratioExtremes.best.date)} à ${share.format(ratioExtremes.worst.ratio)} le ${day(ratioExtremes.worst.date)}`"
              >
                <g v-for="tick in ratioPath.ticks" :key="tick.value">
                  <line
                    :x1="ratioPath.left"
                    :x2="ratioPath.right"
                    :y1="tick.y"
                    :y2="tick.y"
                    stroke="#e2e8f0"
                    stroke-width="1"
                  />
                  <text
                    :x="ratioPath.left - 8"
                    :y="tick.y"
                    text-anchor="end"
                    dominant-baseline="middle"
                    fill="#4a6488"
                    font-size="11"
                  >{{ rounded.format(tick.value) }}</text>
                </g>
                <path :d="ratioPath.area" fill="var(--color-q2)" fill-opacity="0.1" />
                <path
                  :d="ratioPath.line"
                  fill="none"
                  stroke="var(--color-q3)"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
                <circle
                  v-for="dot in ratioPath.dots"
                  :key="dot.date"
                  :cx="dot.cx"
                  :cy="dot.cy"
                  r="4"
                  fill="var(--color-q4)"
                  stroke="#ffffff"
                  stroke-width="2"
                />
              </svg>
              <div class="flex justify-between text-xs tabular-nums text-rail-soft">
                <span>{{ day(ratios[0]!.date, { day: 'numeric', month: 'short' }) }}</span>
                <span>{{ day(ratios.at(-1)!.date, { day: 'numeric', month: 'short' }) }}</span>
              </div>

              <details class="mt-4">
                <summary class="cursor-pointer list-none text-xs font-medium text-accent-strong hover:underline">
                  Voir les données
                </summary>
                <div class="mt-2 max-h-64 overflow-y-auto">
                  <table class="w-full text-left text-xs">
                    <thead class="text-rail-soft">
                      <tr>
                        <th scope="col" class="py-1 pr-3 font-medium">Jour de départ</th>
                        <th scope="col" class="py-1 pr-3 text-right font-medium">Éligibles</th>
                        <th scope="col" class="py-1 pr-3 text-right font-medium">Publiées</th>
                        <th scope="col" class="py-1 text-right font-medium">Part</th>
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                      <tr v-for="entry in ratios" :key="entry.date">
                        <td class="py-1 pr-3">{{ day(entry.date) }}</td>
                        <td class="py-1 pr-3 text-right tabular-nums">{{ count.format(entry.eligible) }}</td>
                        <td class="py-1 pr-3 text-right tabular-nums">{{ count.format(entry.total) }}</td>
                        <td class="py-1 text-right tabular-nums">{{ share.format(entry.ratio) }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </details>
            </figure>
          </section>

          <section class="mt-14">
            <h2 class="text-2xl font-bold">Où l'offre se concentre</h2>
            <p v-if="scope" class="mt-3 max-w-3xl leading-relaxed text-rail-soft">
              Chaque trait est une liaison réservable sans correspondance depuis {{ scope }},
              d'autant plus épaisse et foncée qu'elle porte d'offres sur la fenêtre. La vue
              « densité » remplace les traits par une surface, où se lit la portée réelle de la
              gare plutôt que ses seules destinations.
            </p>
            <p v-else class="mt-3 max-w-3xl leading-relaxed text-rail-soft">
              Chaque trait est une liaison réservable sans correspondance, d'autant plus épaisse et
              foncée qu'elle porte d'offres sur la fenêtre. Les grands axes depuis Paris dominent,
              mais le réseau réservable va bien au-delà. La vue « densité » remplace les traits par
              une surface, où se lisent surtout les régions que l'abonnement laisse de côté.
            </p>
            <NetworkMap
              :stations="stats.network.stations"
              :links="stats.network.links"
              :link-count="stats.network.linkCount"
            />
          </section>

          <section v-if="axisBars.length && stats.coverage" class="mt-14">
            <h2 class="text-2xl font-bold">Tous les axes ne se valent pas</h2>
            <p class="mt-3 max-w-3xl leading-relaxed text-rail-soft">
              La SNCF range ses trains par axe commercial. Sur chacun, la part où une place
              d'abonnement est ouverte va de {{ axisBars.at(-1)!.display }} à
              {{ axisBars[0]!.display }} : un même abonnement n'ouvre pas la même France selon la
              direction.
            </p>
            <div class="mt-6 grid gap-4 sm:grid-cols-2">
              <AxisCard
                v-for="axis in stats.coverage.axes"
                :key="axis.label"
                :label="axis.label"
                :share="rounded.format(axis.total ? axis.eligible / axis.total : 0)"
                :eligible="count.format(axis.eligible)"
                :total="count.format(axis.total)"
                :stations="axis.stations"
                :backdrop="allAxisStations"
              />
            </div>

            <p class="mt-4 text-sm text-rail-soft">
              Sept axes n'ouvrent
              <strong class="text-rail">aucune</strong> place d'abonnement et ne figurent pas
              ci-dessus : {{ stats.coverage.excluded.map((a) => a.label).join(', ') }}. Ils
              représentent tout de même
              {{ count.format(stats.coverage.excluded.reduce((sum, a) => sum + a.total, 0)) }}
              trains publiés — l'offre Ouigo et une partie des Intercités ne sont pas couvertes par
              l'abonnement.
            </p>
          </section>

          <section class="mt-14">
            <h2 class="text-2xl font-bold">Quand partir</h2>
            <p v-if="bestWeekday && worstWeekday && busiestHour" class="mt-3 max-w-3xl leading-relaxed text-rail-soft">
              Le {{ bestWeekday.full }} porte en moyenne
              <strong class="text-rail">{{ bestWeekday.display }}</strong> offres réservables, le
              {{ worstWeekday.full }} <strong class="text-rail">{{ worstWeekday.display }}</strong>.
              Sur une fenêtre de 30 jours, chaque jour de semaine n'est observé que quatre ou cinq
              fois : cet écart décrit ce mois-ci, pas une règle de la SNCF.
            </p>
            <HeatGrid
              title="Offres réservables par jour de la semaine et heure de départ"
              unit="Offres par jour"
              :cells="gridCells"
            />
            <p v-if="busiestSlot && busiestHour" class="mt-3 text-sm text-rail-soft">
              Le créneau le mieux servi est le
              {{ WEEKDAYS[busiestSlot.weekday - 1] }} à {{ busiestSlot.hour }}h, et l'heure la plus
              fournie toutes semaines confondues est {{ busiestHour.label }} avec
              {{ busiestHour.display }} offres. Le creux de la mi-journée et les deux bosses du
              matin et du soir sont ceux de la grille SNCF elle-même, pas un effet de
              l'abonnement. Chaque case est une moyenne par jour, pour que les colonnes se
              comparent malgré les quatre ou cinq occurrences de chaque jour dans la fenêtre.
            </p>
          </section>

          <section class="mt-14">
            <h2 class="text-2xl font-bold">Surtout des trajets courts</h2>
            <p class="mt-3 max-w-3xl leading-relaxed text-rail-soft">
              {{ rounded.format(shortShare) }} des offres réservables durent moins de 1h30. Les
              couleurs sont celles de la carte de l'application, où chaque destination porte la
              teinte de sa durée.
            </p>
            <ChartBars
              title="Offres par durée de trajet"
              unit="Offres"
              orientation="bars"
              :bars="durationBars"
            />
          </section>

          <section class="mt-14">
            <h2 class="text-2xl font-bold">Le détail, jour par jour</h2>
            <p v-if="dailyPeak" class="mt-3 max-w-3xl leading-relaxed text-rail-soft">
              Le volume d'offres réservables suit les deux effets précédents : le jour de la
              semaine et la distance au départ. Le mieux servi de la fenêtre est le
              {{ dailyPeak.full }}, avec {{ dailyPeak.display }} offres.
            </p>
            <ChartBars
              title="Offres réservables par jour de départ"
              unit="Offres"
              :bars="dailyBars"
              :emphasis="dailyPeak?.key"
            />
          </section>

          <section class="mt-14">
            <h2 class="text-2xl font-bold">
              {{ scope ? `Où l'on va le plus depuis ${scope}` : 'Les gares les mieux desservies' }}
            </h2>
            <p v-if="scope" class="mt-3 max-w-3xl leading-relaxed text-rail-soft">
              Les destinations qui portent le plus d'offres au départ de {{ scope }}. La colonne
              de droite compte les gares d'où elles sont aussi joignables, sur tout le réseau.
            </p>
            <p v-else class="mt-3 max-w-3xl leading-relaxed text-rail-soft">
              Au départ et à l'arrivée. La colonne de droite est celle qui compte pour choisir un
              point de départ : elle ne double pas une ville parce que plusieurs trains y vont.
            </p>
            <div class="mt-6 grid gap-6" :class="!scope && 'lg:grid-cols-2'">
              <div v-if="stats.topOrigins.length" class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table class="w-full text-sm">
                  <caption class="border-b border-slate-200 p-4 text-left text-sm font-medium text-rail">
                    Au départ
                  </caption>
                  <thead class="border-b border-slate-200 text-left text-rail-soft">
                    <tr>
                      <th scope="col" class="px-4 py-2 font-medium">Gare</th>
                      <th scope="col" class="px-4 py-2 text-right font-medium">Offres</th>
                      <th scope="col" class="px-4 py-2 text-right font-medium">Destinations</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <tr v-for="station in stats.topOrigins" :key="station.label" class="transition hover:bg-slate-50">
                      <th scope="row" class="px-4 py-2 text-left font-medium">
                        <button
                          type="button"
                          class="text-left text-accent-strong hover:underline"
                          @click="scopeTo(station.label)"
                        >
                          {{ station.label }}
                        </button>
                      </th>
                      <td class="px-4 py-2 text-right tabular-nums">{{ count.format(station.offers) }}</td>
                      <td class="px-4 py-2 text-right tabular-nums">{{ station.destinations }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <table class="w-full text-sm">
                  <caption class="border-b border-slate-200 p-4 text-left text-sm font-medium text-rail">
                    À l'arrivée
                  </caption>
                  <thead class="border-b border-slate-200 text-left text-rail-soft">
                    <tr>
                      <th scope="col" class="px-4 py-2 font-medium">Gare</th>
                      <th scope="col" class="px-4 py-2 text-right font-medium">Offres</th>
                      <th scope="col" class="px-4 py-2 text-right font-medium">Origines</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-slate-100">
                    <tr v-for="dest in stats.topDestinations" :key="dest.label" class="transition hover:bg-slate-50">
                      <th scope="row" class="px-4 py-2 text-left font-medium">
                        <NuxtLink
                          :to="{ path: '/app', query: { origin: dest.label, date: stats.window.first, mode: 'to' } }"
                          class="text-accent-strong hover:underline"
                        >
                          {{ dest.label }}
                        </NuxtLink>
                      </th>
                      <td class="px-4 py-2 text-right tabular-nums">{{ count.format(dest.offers) }}</td>
                      <td class="px-4 py-2 text-right tabular-nums">{{ dest.origins }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section class="mt-14">
            <h2 class="text-2xl font-bold">Ce que le relevé quotidien apprend</h2>

            <template v-if="stats.history.soldOut || stats.history.reopened">
              <p class="mt-3 max-w-3xl leading-relaxed text-rail-soft">
                Tout ce qui précède décrit un instant. Une fois par jour, l'offre publiée est
                comparée à celle de la veille : une place réservable hier et absente aujourd'hui est
                partie. Depuis le premier relevé, le {{ day(stats.history.since) }},
                <strong class="text-rail">{{ count.format(stats.history.soldOut) }}</strong> offres
                {{ scope ? `au départ de ${scope}` : '' }} ont ainsi disparu et
                <strong class="text-rail">{{ count.format(stats.history.reopened) }}</strong> sont
                réapparues. C'est la seule partie de ces données que l'open data ne permet pas de
                reconstituer après coup : sa fenêtre glisse, et ce qui n'a pas été noté le jour où
                c'était visible est perdu.
              </p>

              <!-- A run counts the whole export: its rate cannot be narrowed to one station. -->
              <template v-if="!scope">
                <div v-if="attrition !== null && lastRun" class="mt-6 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
                  <h3 class="text-sm font-medium text-rail-soft">
                    Part de l'offre réservable qui disparaît d'un relevé au suivant
                  </h3>
                  <p class="mt-2 text-4xl font-semibold leading-none tracking-tight sm:text-5xl">
                    {{ share.format(attrition) }}
                  </p>
                  <p class="mt-4 max-w-2xl leading-relaxed text-rail-soft">
                    Au relevé du {{ day(lastRun.date) }} :
                    {{ count.format(lastRun.vanished) }} offres parties sur les
                    {{ count.format(lastRun.observed) }} que la veille annonçait réservables,
                    pendant que {{ count.format(lastRun.created) }} entraient dans la fenêtre. Une
                    disparition n'est pas toujours une place vendue : un train supprimé ou déplacé
                    sort du jeu de données de la même façon.
                  </p>
                </div>

                <ChartBars
                  v-if="churnBars.length > 1"
                  title="Offres disparues, relevé par relevé"
                  unit="Offres disparues"
                  :bars="churnBars"
                />
              </template>

              <template v-if="leadBars.length">
                <h3 class="mt-10 text-xl font-bold">Quand les places partent</h3>
                <p v-if="medianLead !== null" class="mt-3 max-w-3xl leading-relaxed text-rail-soft">
                  Chaque disparition est datée deux fois : le jour où elle est constatée, et le jour
                  du départ concerné. L'écart entre les deux dit à quelle distance du voyage
                  l'abonnement cesse d'être une option. La moitié des places disparaissent à
                  <strong class="text-rail">{{ medianLead }} jours ou moins</strong> du départ.
                  Les places n'ouvrant que 30 jours avant, c'est toute la fenêtre qui est ici.
                </p>
                <ChartBars
                  title="Offres disparues, selon le nombre de jours restant avant le départ"
                  unit="Offres disparues"
                  :bars="leadBars"
                />
              </template>
            </template>

            <p v-else class="mt-3 max-w-3xl leading-relaxed text-rail-soft">
              Tout ce qui précède décrit un instant. Savoir à quelle vitesse les places partent
              demande de comparer plusieurs relevés : le premier date du
              {{ day(stats.history.since) }}, et aucune place n'a encore changé d'état d'un relevé à
              l'autre. C'est la seule partie de ces données que l'open data ne permet pas de
              reconstituer après coup : sa fenêtre glisse, et ce qui n'a pas été noté le jour où
              c'était visible est perdu. Cette section se remplira d'elle-même.
            </p>
          </section>
        </div>
      </ClientOnly>

      <section class="mt-14">
        <h2 class="text-2xl font-bold">Comment ces chiffres sont obtenus</h2>
        <p class="mt-3 max-w-3xl leading-relaxed text-rail-soft">
          Ils sortent du même jeu de données que les recherches : la
          <a
            class="font-medium text-accent-strong underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
            href="https://ressources.data.sncf.com/explore/dataset/tgvmax/"
            target="_blank"
            rel="noopener"
          >« Disponibilité à 30 jours de places MAX JEUNE et MAX SENIOR »</a>
          publiée par la SNCF, ingérée une fois par jour et comptée telle quelle. Une
          <strong class="text-rail">offre</strong>, ici, c'est une ligne de ce jeu de données : un
          train, un jour, une origine et une destination. Un même train qui dessert cinq gares en
          produit donc plusieurs, et le total des offres est toujours bien supérieur au nombre de
          liaisons ou de destinations.
        </p>
        <p class="mt-4 max-w-3xl leading-relaxed text-rail-soft">
          La part éligible compare deux comptes du même relevé : les lignes où la SNCF signale une
          place d'abonnement ouverte, et toutes les lignes publiées. Ce n'est ni un nombre de
          places, que l'open data ne publie pas, ni une part des trains en circulation, dont il ne
          dit rien non plus : un train sans réservation obligatoire n'y figure pas.
        </p>
        <p class="mt-4 leading-relaxed text-rail-soft">
          Le détail des sources et de la méthode est sur la page
          <NuxtLink to="/a-propos" class="font-medium text-accent-strong hover:underline">À propos</NuxtLink>.
        </p>
      </section>

      <div class="mt-14 overflow-hidden rounded-3xl bg-rail px-6 py-12 text-center">
        <h2 class="text-2xl font-bold text-white">À vous de choisir où aller</h2>
        <NuxtLink
          to="/app"
          class="mt-5 inline-block rounded-xl bg-coral px-8 py-3 font-semibold text-white shadow-lg shadow-coral/40 transition hover:-translate-y-0.5 hover:bg-coral-strong"
        >
          Ouvrir la carte →
        </NuxtLink>
      </div>
    </main>

    <footer class="border-t border-slate-200 py-8">
      <div class="mx-auto max-w-5xl px-5 text-center text-sm text-rail-soft sm:px-8">
        <NuxtLink to="/" class="underline hover:text-rail">Retour à l'accueil</NuxtLink>
      </div>
    </footer>
  </div>
</template>
