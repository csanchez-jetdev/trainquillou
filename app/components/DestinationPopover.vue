<script setup lang="ts">
import type { Destination, ReturnDatesResult, SearchMode } from '~~/shared/types'
import { prettyLabel } from '~~/shared/stations'

/**
 * Fiche d'une destination, ouverte au clic sur son marqueur. Rassemble tout ce qu'on
 * sait déjà de la ville — horaires, durée, notoriété, dates de retour — au lieu de le
 * laisser éparpillé entre la carte et le rail.
 */
const props = defineProps<{
  destination: Destination
  mode: SearchMode
  /** Gare de référence de la recherche, pour libeller les trajets. */
  originLabel: string
  originSlug?: string
  returnsLoading?: boolean
  returns?: ReturnDatesResult | null
}>()

const emit = defineEmits<{
  close: []
  'show-returns': [string]
}>()

const pop = computed(() => popularityTier(props.destination.popularity))
const name = computed(() => prettyLabel(props.destination.label))
const originName = computed(() => prettyLabel(props.originLabel))

/** En recherche inverse, le trajet part de la ville affichée et rejoint la gare cherchée. */
const isInbound = computed(() => props.mode === 'to')
const fromName = computed(() => (isInbound.value ? name.value : originName.value))
const toName = computed(() => (isInbound.value ? originName.value : name.value))

const outbound = computed(() => props.destination.trains ?? [])
const fastest = computed(() => fastestTrip(outbound.value))
const window = computed(() => departureWindow(outbound.value))

const legSlugs = computed(() => {
  const hub = props.originSlug
  const other = props.destination.slug
  if (!hub || !other) return null
  return isInbound.value ? { from: other, to: hub } : { from: hub, to: other }
})

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}
</script>

<template>
  <div
    data-test="dest-popover"
    class="w-[19rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
    role="dialog"
    :aria-label="`Détails pour ${name}`"
  >
    <!-- En-tête -->
    <div class="flex items-start justify-between gap-2 border-b border-slate-100 px-3.5 pb-2.5 pt-3">
      <div class="min-w-0">
        <h3 class="truncate text-base font-bold leading-tight text-rail">{{ name }}</h3>
        <p v-if="pop.tier > 0" class="mt-0.5 text-xs text-amber-500">
          {{ pop.stars }} <span class="text-rail-soft">{{ pop.label }}</span>
        </p>
      </div>
      <button
        type="button"
        data-test="popover-close"
        aria-label="Fermer"
        class="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-rail-soft transition hover:bg-slate-100 hover:text-rail"
        @click="emit('close')"
      >
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="max-h-[22rem] overflow-y-auto px-3.5 py-3">
      <!-- Résumé du trajet -->
      <p class="text-xs text-rail-soft">
        {{ fromName }} <span class="text-slate-300">→</span> {{ toName }}
      </p>

      <!-- Mode plage de dates : jours joignables -->
      <template v-if="mode === 'range' && destination.availableDates">
        <p class="mt-2 text-sm font-semibold text-rail">
          Joignable {{ destination.availableDates.length }} jour(s)
        </p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <span
            v-for="d in destination.availableDates"
            :key="d"
            class="rounded-md bg-slate-100 px-2 py-0.5 text-sm text-rail-soft"
          >
            {{ formatDate(d) }}
          </span>
        </div>
      </template>

      <template v-else>
        <!-- Ce qu'on sait du trajet : nombre d'options, amplitude, durée la plus courte -->
        <div class="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="text-sm font-semibold text-rail">
            {{ outbound.length }} {{ outbound.length > 1 ? 'trains' : 'train' }}
          </span>
          <span v-if="fastest" class="text-sm text-rail-soft">
            dès <strong class="font-semibold text-rail">{{ formatDuration(tripDurationMin(fastest)) }}</strong> de trajet
          </span>
        </div>
        <p v-if="window && outbound.length > 1" class="mt-0.5 text-xs text-rail-soft">
          Départs de {{ window.first }} à {{ window.last }}
        </p>

        <!-- Horaires détaillés -->
        <ul class="mt-2.5 flex flex-col gap-1">
          <li
            v-for="t in outbound"
            :key="`out-${t.departure}-${t.trainNumber}`"
            data-test="popover-train"
            class="flex items-baseline gap-2 rounded-md bg-slate-50 px-2 py-1 text-sm"
          >
            <span class="font-semibold tabular-nums text-rail">{{ t.departure }}</span>
            <span class="text-slate-300">→</span>
            <span class="tabular-nums text-rail-soft">{{ t.arrival }}</span>
            <span class="ml-auto text-xs tabular-nums text-rail-soft">
              {{ formatDuration(tripDurationMin(t)) }}
            </span>
            <span v-if="t.trainNumber" class="text-xs text-rail-soft/70">n°{{ t.trainNumber }}</span>
          </li>
        </ul>

        <!-- Mode aller-retour : le retour, dans l'autre sens -->
        <template v-if="mode === 'roundtrip' && destination.returnTrains?.length">
          <p class="mt-3 text-xs font-semibold uppercase tracking-wide text-coral-strong">
            Retour vers {{ originName }}
          </p>
          <ul class="mt-1.5 flex flex-col gap-1">
            <li
              v-for="t in destination.returnTrains"
              :key="`back-${t.departure}-${t.trainNumber}`"
              data-test="popover-return"
              class="flex items-baseline gap-2 rounded-md bg-coral/5 px-2 py-1 text-sm"
            >
              <span class="font-semibold tabular-nums text-coral-strong">{{ t.departure }}</span>
              <span class="text-coral/40">→</span>
              <span class="tabular-nums text-rail-soft">{{ t.arrival }}</span>
              <span class="ml-auto text-xs tabular-nums text-rail-soft">
                {{ formatDuration(tripDurationMin(t)) }}
              </span>
            </li>
          </ul>
        </template>
      </template>

      <!-- Dates de retour à la demande, comme dans le rail -->
      <template v-if="mode === 'from'">
        <button
          v-if="!returns"
          type="button"
          data-test="popover-returns"
          :disabled="returnsLoading"
          class="mt-3 w-full rounded-lg bg-accent/10 px-3 py-1.5 text-sm font-medium text-accent-strong transition hover:bg-accent/20 disabled:opacity-60"
          @click="emit('show-returns', destination.label)"
        >
          {{ returnsLoading ? 'Recherche des retours…' : 'Quand puis-je rentrer ?' }}
        </button>
        <div v-else class="mt-3 border-t border-slate-100 pt-2.5">
          <p class="text-xs font-semibold uppercase tracking-wide text-rail-soft">
            Retours vers {{ originName }}
          </p>
          <p v-if="!returns.dates.length" class="mt-1 text-sm text-rail-soft">
            Aucun retour TGVmax disponible.
          </p>
          <div v-else class="mt-1.5 flex flex-wrap gap-1.5">
            <span
              v-for="d in returns.dates.slice(0, 14)"
              :key="d"
              class="rounded-md bg-accent/10 px-2 py-0.5 text-sm text-accent-strong"
            >
              {{ formatDate(d) }}
            </span>
            <span v-if="returns.dates.length > 14" class="px-1 py-0.5 text-sm text-rail-soft">
              +{{ returns.dates.length - 14 }}
            </span>
          </div>
        </div>
      </template>
    </div>

    <!--
      Réservation. Chaque revendeur porte sa propre couleur : on sort du site, autant
      savoir où l'on arrive. Deux moitiés égales — `basis-1/2` et non `flex-1`, dont la
      base `auto` répartirait selon la longueur du libellé.
    -->
    <div v-if="legSlugs" class="border-t border-slate-100 bg-slate-50/60 px-3.5 py-2.5">
      <p class="text-[11px] font-medium text-rail-soft">Réserver ce trajet</p>
      <div class="mt-1.5 flex items-stretch gap-2">
        <a
          :href="sncfConnectUrl(legSlugs.from, legSlugs.to)"
          target="_blank"
          rel="noopener"
          data-test="popover-book-sncf"
          class="flex basis-1/2 items-center justify-center rounded-lg bg-sncf px-3 py-2 text-xs font-semibold text-white transition hover:bg-sncf-hover"
        >
          SNCF Connect
        </a>
        <a
          :href="trainlineUrl(legSlugs.from, legSlugs.to)"
          target="_blank"
          rel="noopener"
          data-test="popover-book-trainline"
          class="flex basis-1/2 items-center justify-center rounded-lg bg-trainline px-3 py-2 text-xs font-semibold text-white transition hover:bg-trainline-hover"
        >
          Trainline
        </a>
      </div>
    </div>
  </div>
</template>
