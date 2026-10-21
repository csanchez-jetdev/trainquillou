<script setup lang="ts">
import { seoDescription, seoTitle } from '~~/shared/seo'
import { cityName } from '~~/shared/stations'

const { data: index } = await useLiaisonIndex()

const name = cityName

const byOrigin = computed(() => {
  const groups = new Map<string, typeof index.value>()
  for (const entry of index.value ?? []) {
    groups.set(entry.from, [...(groups.get(entry.from) ?? []), entry])
  }
  return [...groups.entries()]
})

const total = computed(() => index.value?.length ?? 0)

const { public: { siteUrl } } = useRuntimeConfig()
const base = siteUrl.replace(/\/$/, '')
const canonical = `${base}/liaisons`

const title = seoTitle('Les liaisons TGVmax, gare par gare')
const description = seoDescription(
  `Toutes les liaisons TGVmax (MAX JEUNE) suivies par Trainquillou, avec les jours réservables `
  + `de chacune.`,
  `Paris, Lyon, Marseille, Bordeaux, Toulouse, Lille, Nice.`,
  `Gratuit, sans compte.`,
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
          { '@type': 'ListItem', position: 2, name: 'Liaisons', item: canonical },
        ],
      }),
    },
  ],
})
</script>

<template>
  <div class="min-h-[100dvh] bg-cream text-rail">
    <SiteHeader wide />

    <main class="mx-auto max-w-5xl px-5 py-12 sm:px-8">
      <nav aria-label="Fil d'ariane" class="mb-6 text-sm text-rail-soft">
        <NuxtLink to="/" class="hover:text-rail">Accueil</NuxtLink>
        <span class="mx-1.5">/</span>
        <span class="text-rail">Liaisons</span>
      </nav>

      <h1 class="font-display text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">
        Les liaisons <span class="text-accent-strong">TGVmax</span>, gare par gare
      </h1>
      <p class="mt-4 max-w-2xl text-lg text-rail-soft">
        {{ total }} liaisons, chacune avec sa page : les jours où elle est réservable, les horaires
        du prochain d'entre eux et les dates de retour. Les chiffres ci-dessous viennent de l'open
        data SNCF et changent tous les jours. Toutes les autres gares restent cherchables dans
        l'application.
      </p>

      <section v-for="[from, entries] in byOrigin" :key="from" class="mt-12">
        <h2 class="text-xl font-bold sm:text-2xl">
          Au départ de
          <NuxtLink :to="`/depuis/${from}`" class="text-accent-strong underline decoration-accent/40 underline-offset-4 hover:decoration-accent-strong">
            {{ name(from) }}
          </NuxtLink>
          <span class="ml-2 text-sm font-medium text-rail-soft">
            {{ entries!.length }} {{ entries!.length > 1 ? 'liaisons' : 'liaison' }}
          </span>
        </h2>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <LiaisonCard
            v-for="entry in entries"
            :key="entry.to"
            :from="entry.from"
            :to="entry.to"
            :liaison="entry.liaison"
          />
        </div>
      </section>

      <div class="mt-14 overflow-hidden rounded-3xl bg-rail px-6 py-14 text-center">
        <h2 class="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Votre liaison n'est pas dans la liste ?
        </h2>
        <p class="mx-auto mt-3 max-w-xl text-white/70">
          Toutes les gares du réseau TGVmax restent cherchables. Indiquez la vôtre et la date qui
          vous arrange.
        </p>
        <HeroSearch class="mx-auto mt-7" />
      </div>

    </main>

    <SiteFooter />
  </div>
</template>
