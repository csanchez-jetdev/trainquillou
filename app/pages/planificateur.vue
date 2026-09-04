<script setup lang="ts">
import { todayISO, lastBookableISO } from '~~/shared/window'

const { stops, date, dateTo, minStay, hasQuery, result, pending, message, plan } = useMultileg()

const MAX_STOPS = 6

const draft = ref<string[]>(stops.value.length >= 2 ? [...stops.value] : ['', ''])
const first = todayISO()
const last = lastBookableISO()

const draftDate = ref(date.value || first)
const draftDateTo = ref(dateTo.value)
const draftStay = ref(Number(minStay.value) || 0)

const canSubmit = computed(
  () => draft.value.filter(Boolean).length >= 2 && Boolean(draftDate.value),
)

function addStop() {
  if (draft.value.length < MAX_STOPS) draft.value.push('')
}

function removeStop(index: number) {
  if (draft.value.length > 2) draft.value.splice(index, 1)
}

function submit() {
  if (!canSubmit.value) return
  plan({
    stops: draft.value,
    date: draftDate.value,
    dateTo: draftDateTo.value || undefined,
    minStay: draftStay.value || undefined,
  })
}

function closeLoop() {
  const start = draft.value[0]
  if (!start) return
  if (draft.value.length < MAX_STOPS) draft.value.push(start)
  else draft.value[draft.value.length - 1] = start
}

const blockedLeg = computed(() => {
  const at = result.value?.blockedAt
  return at == null ? null : result.value!.legs[at]
})

const title = 'Planificateur multi-étapes TGVmax — A → B → C, boucles et excursions'
const description
  = 'Enchaînez plusieurs gares en TGVmax / MAX JEUNE : trajet en plusieurs étapes, boucle '
    + 'qui revient à son point de départ, excursion à la journée. Trainquillou dit sur quels '
    + 'jours chaque étape est réservable.'

useHead({
  title,
  meta: [
    { name: 'description', content: description },
    { name: 'robots', content: 'noindex, follow' },
  ],
})
</script>

<template>
  <div class="min-h-dvh bg-cream text-rail">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex max-w-4xl items-center justify-between px-5 py-4 sm:px-8">
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
        <NuxtLink to="/app" class="text-sm font-medium text-accent-strong hover:underline">
          Recherche sur la carte →
        </NuxtLink>
      </div>
    </header>

    <main class="mx-auto max-w-3xl px-5 py-10 sm:px-8">
      <nav aria-label="Fil d'ariane" class="mb-6 text-sm text-rail-soft">
        <NuxtLink to="/" class="hover:text-rail">Accueil</NuxtLink>
        <span class="mx-1.5">/</span>
        <span class="text-rail">Planificateur</span>
      </nav>

      <h1 class="font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
        Voyage en <span class="text-accent-strong">plusieurs étapes</span>
      </h1>
      <p class="mt-3 text-rail-soft">
        Deux à six gares dans l'ordre. Répétez la première à la fin pour une boucle, et fixez
        les deux dates au même jour pour une excursion.
      </p>

      <form class="mt-8 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" @submit.prevent="submit">
        <div class="divide-y divide-slate-100">
          <div v-for="(stop, index) in draft" :key="index" class="flex items-center gap-2">
            <StationInput
              :model-value="stop"
              :label="index === 0 ? 'Départ' : index === draft.length - 1 ? 'Arrivée' : `Étape ${index}`"
              placeholder="Gare"
              class="flex-1"
              @update:model-value="draft[index] = $event"
            />
            <button
              v-if="draft.length > 2"
              type="button"
              class="shrink-0 rounded-lg px-2 py-1 text-sm text-rail-soft hover:bg-slate-100 hover:text-rail"
              :aria-label="`Retirer l'arrêt ${index + 1}`"
              @click="removeStop(index)"
            >
              ✕
            </button>
          </div>
        </div>

        <div class="mt-3 flex flex-wrap gap-3 text-sm">
          <button
            type="button"
            class="font-medium text-accent-strong hover:underline disabled:text-slate-400 disabled:no-underline"
            :disabled="draft.length >= MAX_STOPS"
            @click="addStop"
          >
            + Ajouter une étape
          </button>
          <button
            type="button"
            class="font-medium text-accent-strong hover:underline"
            @click="closeLoop"
          >
            ↺ Revenir au départ
          </button>
        </div>

        <div class="mt-5 grid gap-4 sm:grid-cols-3">
          <label class="block">
            <span class="text-xs font-medium text-rail-soft">Au plus tôt</span>
            <input
              v-model="draftDate"
              type="date"
              :min="first"
              :max="last"
              required
              class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[15px] outline-none focus:border-accent"
            >
          </label>
          <label class="block">
            <span class="text-xs font-medium text-rail-soft">Au plus tard</span>
            <input
              v-model="draftDateTo"
              type="date"
              :min="draftDate || first"
              :max="last"
              class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[15px] outline-none focus:border-accent"
            >
          </label>
          <label class="block">
            <span class="text-xs font-medium text-rail-soft">Heures sur place</span>
            <input
              v-model.number="draftStay"
              type="number"
              min="0"
              max="72"
              class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[15px] outline-none focus:border-accent"
            >
          </label>
        </div>

        <button
          type="submit"
          :disabled="!canSubmit"
          class="mt-5 w-full rounded-xl bg-accent px-4 py-3 font-semibold text-white transition hover:bg-accent-strong disabled:bg-slate-300"
        >
          Chercher le voyage
        </button>
      </form>

      <ClientOnly>
        <div v-if="pending" class="mt-8 flex justify-center">
          <Spinner />
        </div>

        <p v-else-if="message" class="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          {{ message }}
        </p>

        <section v-else-if="result" class="mt-8">
        <h2 class="text-lg font-bold">
          {{ result.itinerary ? 'Voyage possible' : 'Ce voyage ne passe pas' }}
        </h2>

        <ol v-if="result.itinerary" class="mt-4 space-y-2">
          <li
            v-for="(hop, index) in result.itinerary"
            :key="index"
            class="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div class="flex items-baseline justify-between gap-3">
              <span class="font-semibold">{{ hop.from }} → {{ hop.to }}</span>
              <span class="shrink-0 text-sm text-rail-soft">{{ hop.date }}</span>
            </div>
            <div class="mt-1 text-sm text-rail-soft">
              {{ hop.departure }} → {{ hop.arrival }}
              <span v-if="hop.trainNumber"> · train {{ hop.trainNumber }}</span>
            </div>
          </li>
        </ol>

        <p v-else-if="blockedLeg" class="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          Aucun train direct réservable de <strong>{{ blockedLeg.from }}</strong> vers
          <strong>{{ blockedLeg.to }}</strong> ne s'enchaîne dans cette fenêtre.
          <template v-if="blockedLeg.days.length">
            Cette étape est réservable les {{ blockedLeg.days.join(', ') }} — élargissez les dates
            ou réduisez les heures sur place.
          </template>
          <template v-else>
            Cette étape n'a aucune place TGVmax sur la période. Essayez une gare intermédiaire.
          </template>
        </p>

        <h3 class="mt-8 text-sm font-semibold uppercase tracking-wide text-rail-soft">
          Disponibilité par étape
        </h3>
        <ul class="mt-3 space-y-2">
          <li
            v-for="(leg, index) in result.legs"
            :key="index"
            class="flex items-baseline justify-between gap-3 rounded-lg bg-white px-4 py-3 text-sm"
          >
            <span>{{ leg.from }} → {{ leg.to }}</span>
            <span class="shrink-0 text-rail-soft">
              {{ leg.options }} train{{ leg.options > 1 ? 's' : '' }},
              {{ leg.days.length }} jour{{ leg.days.length > 1 ? 's' : '' }}
            </span>
          </li>
        </ul>

        <p class="mt-6 text-xs text-rail-soft">
          Fenêtre explorée : {{ result.window.from }} → {{ result.window.to }}. Trains directs
          uniquement, sans correspondance.
        </p>
        </section>

        <p v-else-if="!hasQuery" class="mt-8 text-sm text-rail-soft">
          Renseignez au moins deux gares et une date de départ.
        </p>
      </ClientOnly>
    </main>
  </div>
</template>
