<script setup lang="ts">
import { seoDescription, seoTitle } from '~~/shared/seo'
import type { LiaisonResult } from '~~/shared/types'
import { POPULAR_STATIONS } from '~~/shared/stations'
import { todayISO } from '~~/shared/window'
import { humanDay } from '~/utils/dates'

/**
 * Tarif public relevé sur SNCF Connect le 5 septembre 2026.
 *
 * Affiché daté plutôt que présenté comme intemporel : un prix d'abonnement change, et une
 * page qui vieillit à vue vaut mieux qu'une page qui ment sans le dire.
 */
const PRICE_PER_MONTH = 79
const PRICE_CHECKED_ON = '2026-09-05'

const { data: updated } = await useAsyncData('simulateur:updated', () =>
  $fetch<{ updatedOn: string | null; eligibleShare: number | null }>(`${apiBase()}/updated`)
    .catch(() => null))

const eligibleShare = computed(() => {
  const share = updated.value?.eligibleShare
  return share == null ? null : Math.round(share * 100)
})

const from = ref('')
const to = ref('')
const tripsPerMonth = ref(2)

/**
 * Le prix à partir duquel l'abonnement est gagnant.
 *
 * L'open data ne publie aucun tarif : demander le prix du billet reviendrait à faire faire
 * le calcul par la personne. La question s'inverse — combien doit coûter le billet — et se
 * répond sans donnée qu'on n'a pas.
 */
const euros = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })
const breakEvenPrice = computed(() => {
  const legs = tripsPerMonth.value * 2
  return legs > 0 ? euros.format(Math.ceil((PRICE_PER_MONTH / legs) * 100) / 100) : null
})

const pair = ref<LiaisonResult | null>(null)
const back = ref<LiaisonResult | null>(null)
const pending = ref(false)

/** Les deux sens : un aller-retour se réserve deux fois, et l'offre n'est pas symétrique. */
async function simulate() {
  if (!from.value.trim() || !to.value.trim()) return
  pending.value = true
  const today = todayISO()
  const call = (origin: string, dest: string) =>
    $fetch<LiaisonResult>('/api/liaison', { query: { origin, dest, from: today } }).catch(() => null)
  const [there, home] = await Promise.all([
    call(from.value.trim(), to.value.trim()),
    call(to.value.trim(), from.value.trim()),
  ])
  pair.value = there
  back.value = home
  pending.value = false
  track('rentability_sim', {
    origin: from.value.trim(),
    destination: to.value.trim(),
    trips: tripsPerMonth.value,
    days: there?.days.length ?? -1,
  })
}

/** Les allers-retours réellement possibles : un jour compte s'il a un retour au-delà. */
const feasibleTrips = computed(() => {
  if (!pair.value || !back.value) return null
  const returns = new Set(back.value.days.map((d) => d.date))
  return pair.value.days.filter((d) => [...returns].some((r) => r >= d.date)).length
})

const { public: { siteUrl } } = useRuntimeConfig()
const base = siteUrl.replace(/\/$/, '')
const canonical = `${base}/simulateur-tgvmax`

const title = seoTitle('Simulateur TGVmax : places à 0 € sur 30 jours')
const description = seoDescription(
  'Les places TGVmax (MAX JEUNE) ouvertes sur les trente prochains jours, gare par gare et sur '
  + 'une carte.',
  'Plus le nombre de trajets qui rentabilisent l\'abonnement.',
  'Gratuit, sans compte.',
)

useHead({
  title,
  link: [{ rel: 'canonical', href: canonical }],
  meta: [
    { name: 'description', content: description },
    { property: 'og:title', content: title },
    { property: 'og:description', content: description },
    { property: 'og:url', content: canonical },
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: base },
          { '@type': 'ListItem', position: 2, name: 'Simulateur TGVmax', item: canonical },
        ],
      }),
    },
  ],
})
</script>

<template>
  <div class="min-h-[100dvh] bg-cream text-rail">
    <SiteHeader />

    <main class="mx-auto max-w-4xl px-5 py-12 sm:px-8">
      <nav aria-label="Fil d'ariane" class="mb-6 text-sm text-rail-soft">
        <NuxtLink to="/" class="hover:text-rail">Accueil</NuxtLink>
        <span class="mx-1.5">/</span>
        <span class="text-rail">Simulateur TGVmax</span>
      </nav>

      <h1 class="font-display text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
        Simulateur <span class="text-accent-strong">TGVmax</span>
      </h1>
      <p class="mt-4 max-w-2xl text-lg text-rail-soft">
        Trainquillou permet de faire une simulation de rentabilité de l'abonnement TGVmax.
        <template v-if="eligibleShare">
          Au dernier relevé, <strong class="text-rail">{{ eligibleShare }} %</strong> des trajets
          publiés par la SNCF étaient réservables avec l'abonnement.
        </template>
      </p>

      <section class="mt-8 overflow-hidden rounded-2xl bg-rail px-6 py-7 text-white">
        <p class="text-[11px] font-semibold tracking-[0.12em] text-accent uppercase">
          Simuler la rentabilité
        </p>
        <h2 class="mt-2 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
          Combien de trajets pour couvrir l'abonnement ?
        </h2>

        <form class="mt-6 flex flex-col gap-4 lg:flex-row lg:items-end" @submit.prevent="simulate">
          <div class="flex-1 rounded-xl bg-white">
            <StationInput v-model="from" label="Depuis" placeholder="Paris, Lyon…" :exclude="to" test-id="sim-from" />
            <div class="mx-3 h-px bg-slate-100" />
            <StationInput v-model="to" label="Vers" placeholder="Marseille, Lille…" :exclude="from" test-id="sim-to" />
          </div>
          <label class="block shrink-0">
            <span class="block text-sm text-white/70">Allers-retours par mois</span>
            <span class="mt-1.5 flex items-center rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/20 focus-within:ring-accent">
              <input
                v-model.number="tripsPerMonth"
                type="number"
                min="1"
                max="30"
                step="1"
                inputmode="numeric"
                data-test="trips-per-month"
                class="w-16 bg-transparent font-display text-xl font-bold tabular-nums outline-none"
              >
            </span>
          </label>
          <button
            type="submit"
            data-test="sim-submit"
            class="shrink-0 rounded-xl bg-coral-strong px-5 py-3 text-sm font-semibold text-white transition hover:bg-coral-ink"
          >
            {{ pending ? 'Calcul…' : 'Simuler' }}
          </button>
        </form>

        <p v-if="breakEvenPrice" data-test="verdict" class="mt-5 text-white/70">
          À {{ tripsPerMonth }} {{ tripsPerMonth > 1 ? 'allers-retours' : 'aller-retour' }} par
          mois, l'abonnement à <b class="font-semibold text-white">{{ PRICE_PER_MONTH }} €</b> est
          gagnant dès que le billet coûte plus de
          <b class="font-display text-xl font-bold text-white tabular-nums">{{ breakEvenPrice }}</b>
          l'aller simple.
        </p>

        <p v-if="pair && back" data-test="availability" class="mt-3 text-white/70">
          <template v-if="feasibleTrips">
            Sur cette liaison, <b class="font-semibold text-white">{{ feasibleTrips }}</b>
            {{ feasibleTrips > 1 ? 'jours' : 'jour' }} des trente prochains permettent l'aller
            <em>et</em> le retour en direct — de quoi couvrir
            {{ Math.floor(feasibleTrips / tripsPerMonth) >= 1 ? 'votre rythme' : 'moins que votre rythme' }}.
          </template>
          <template v-else>
            Aucun aller-retour direct sur les trente prochains jours : l'abonnement ne se
            rentabilise pas sur cette liaison seule.
          </template>
        </p>

        <p class="mt-5 border-t border-white/10 pt-4 text-sm text-white/70">
          Reste à savoir combien de vos trajets trouveront une place. C'est la seconde moitié
          de la simulation, et elle se fait sur la carte.
        </p>
      </section>

      <section class="mt-14">
        <h2 class="text-xl font-bold sm:text-2xl">Simuler vos trajets</h2>
        <p class="mt-3 max-w-2xl text-rail-soft">
          Indiquez votre gare et la date qui vous arrange : la carte montre toutes les
          destinations où il reste des places, sur la fenêtre de trente jours.
        </p>
        <HeroSearch class="mt-5" />
      </section>

      <section class="mt-14">
        <h2 class="text-xl font-bold sm:text-2xl">Simuler depuis votre gare</h2>
        <p class="mt-3 max-w-2xl text-rail-soft">
          Chaque gare a sa page : les destinations réservables, comptées en jours sur la fenêtre.
        </p>
        <ul class="mt-5 flex flex-wrap gap-2">
          <li v-for="p in POPULAR_STATIONS" :key="p.slug">
            <NuxtLink
              :to="`/depuis/${p.slug}`"
              class="inline-block rounded-lg bg-white px-3.5 py-2 text-sm font-medium ring-1 ring-slate-200 transition hover:text-accent-strong hover:ring-accent"
            >
              Depuis {{ p.name }}
            </NuxtLink>
          </li>
        </ul>
        <p class="mt-5 text-rail-soft">
          Pour une liaison précise, ses jours réservables et ses horaires :
          <NuxtLink to="/liaisons" class="font-medium text-accent-strong hover:underline">
            la liste des liaisons suivies
          </NuxtLink>.
        </p>
      </section>

      <section class="mt-14">
        <h2 class="text-xl font-bold sm:text-2xl">Quatre règles qui décident de tout</h2>
        <div class="mt-4 grid gap-3 sm:grid-cols-2">
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <h3 class="font-display font-bold">Les places ouvrent à trente jours</h3>
            <p class="mt-1.5 text-sm text-rail-soft">
              Contre quatre-vingt-dix pour une réservation classique. C'est la fenêtre que
              simule cette page, jour par jour.
            </p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <h3 class="font-display font-bold">Le contingent varie du simple au septuple</h3>
            <p class="mt-1.5 text-sm text-rail-soft">
              Chaque train ouvre un nombre limité de places à 0 €, en 2nde classe. Une liaison
              est réservable quatre jours sur trente, une autre vingt-neuf : c'est ce que la
              simulation mesure.
            </p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <h3 class="font-display font-bold">Un indicateur par trajet</h3>
            <p class="mt-1.5 text-sm text-rail-soft">
              L'open data SNCF dit si des places sont ouvertes, pas combien il en reste. Le
              simulateur affiche donc ce qui est vérifiable, et rien d'autre.
            </p>
          </div>
          <div class="rounded-xl border border-slate-200 bg-white p-4">
            <h3 class="font-display font-bold">Les places reviennent</h3>
            <p class="mt-1.5 text-sm text-rail-soft">
              Le contingent est republié chaque matin, et un train complet peut rouvrir. Une
              liaison vide aujourd'hui vaut d'être resimulée demain.
            </p>
          </div>
        </div>
      </section>

      <div class="mt-14 grid gap-3 sm:grid-cols-2">
        <section class="rounded-xl border border-slate-200 bg-white p-4">
          <h2 class="font-display text-lg font-bold">L'abonnement en deux lignes</h2>
          <p class="mt-2 text-sm text-rail-soft">
            MAX JEUNE s'adresse aux 16-27 ans, s'engage sur trois mois minimum et coûte
            {{ PRICE_PER_MONTH }} € par mois — tarif relevé le
            <time :datetime="PRICE_CHECKED_ON">{{ humanDay(PRICE_CHECKED_ON, { year: true }) }}</time>.
          </p>
          <a
            href="https://www.sncf-connect.com/aide/max-jeune"
            target="_blank"
            rel="noopener"
            class="mt-3 inline-block text-sm font-medium text-accent-strong hover:underline"
          >Les conditions officielles, sur SNCF Connect</a>
        </section>

        <section class="rounded-xl border border-slate-200 bg-white p-4">
          <h2 class="font-display text-lg font-bold">Aller plus loin</h2>
          <p class="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-sm">
            <NuxtLink to="/stats" class="font-medium text-accent-strong hover:underline">
              Statistiques de l'offre
            </NuxtLink>
            <NuxtLink to="/liaisons" class="font-medium text-accent-strong hover:underline">
              Liaisons suivies
            </NuxtLink>
            <NuxtLink to="/a-propos" class="font-medium text-accent-strong hover:underline">
              Méthode et sources
            </NuxtLink>
          </p>
          <p v-if="updated?.updatedOn" class="mt-3 text-sm text-rail-soft">
            Dernier relevé de l'open data :
            <time :datetime="updated.updatedOn">{{ humanDay(updated.updatedOn) }}</time>.
          </p>
        </section>
      </div>

    </main>

    <SiteFooter />
  </div>
</template>
