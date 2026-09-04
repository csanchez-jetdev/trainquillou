<script setup lang="ts">
import type { Destination, ReturnDatesResult, SearchMode } from '~~/shared/types'
import { prettyLabel } from '~~/shared/stations'

const props = defineProps<{
  destination: Destination
  mode: SearchMode
  originLabel: string
  originSlug?: string
  returnsLoading?: boolean
  returns?: ReturnDatesResult | null
  /** `drawer`: a sheet pinned to the bottom edge; `inline`: opens inside the list. */
  layout?: 'drawer' | 'inline'
  /** Drawer reduced to a single line. */
  collapsed?: boolean
}>()

const isDrawer = computed(() => props.layout === 'drawer')

const emit = defineEmits<{
  close: []
  /** Narrow screens only: the sheet floats over the map, so leaving it goes back to the list. */
  back: []
  toggle: []
  'show-returns': [string]
  /** A return date was picked; turning it into a search is the page's business. */
  'pick-return': [destination: string, date: string]
}>()

const pop = computed(() => popularityTier(props.destination.popularity))
const name = computed(() => prettyLabel(props.destination.label))
const originName = computed(() => prettyLabel(props.originLabel))

/** In reverse search the trip starts from the displayed city and reaches the searched one. */
const isInbound = computed(() => props.mode === 'to')
const fromName = computed(() => (isInbound.value ? name.value : originName.value))
const toName = computed(() => (isInbound.value ? originName.value : name.value))

const outbound = computed(() => props.destination.trains ?? [])
const fastest = computed(() => fastestTrip(outbound.value))
const window = computed(() => departureWindow(outbound.value))

/** All the collapsed drawer shows. */
const gist = computed(() => {
  if (props.mode === 'range') return `${props.destination.availableDates?.length ?? 0} jours`
  const trains = `${outbound.value.length} train${outbound.value.length > 1 ? 's' : ''}`
  return fastest.value
    ? `${trains} · dès ${formatDuration(tripDurationMin(fastest.value))}`
    : trains
})

const legSlugs = computed(() => {
  const hub = props.originSlug
  const other = props.destination.slug
  if (!hub || !other) return null
  return isInbound.value ? { from: other, to: hub } : { from: hub, to: other }
})

function onBook(provider: 'sncf_connect' | 'trainline') {
  track('booking_click', { provider, destination: props.destination.label, mode: props.mode })
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}
</script>

<template>
  <div
    data-test="dest-detail"
    :class="[
      'flex flex-col overflow-hidden',
      isDrawer
        ? 'w-full rounded-t-2xl border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl'
        : 'bg-accent/[.05]',
    ]"
    :role="isDrawer ? 'dialog' : 'region'"
    :aria-label="`Détails pour ${name}`"
  >
    <template v-if="isDrawer">
      <button
        type="button"
        data-test="detail-toggle"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? 'Déplier les détails' : 'Réduire les détails'"
        class="flex shrink-0 justify-center py-2 text-rail-soft transition hover:bg-slate-50"
        @click="emit('toggle')"
      >
        <svg
          class="h-4 w-4 transition-transform"
          :class="collapsed ? 'rotate-180' : ''"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      <div
        :class="[
          'flex shrink-0 items-center gap-1 px-2',
          collapsed ? 'pb-2' : 'border-b border-slate-100 pb-2',
        ]"
      >
        <button
          type="button"
          data-test="detail-back"
          :aria-label="collapsed ? 'Retour aux résultats' : undefined"
          class="flex shrink-0 items-center gap-0.5 rounded-md px-2 py-2.5 text-xs font-medium text-accent-strong transition hover:bg-accent/10"
          @click="emit('back')"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          <span v-if="!collapsed">Résultats</span>
        </button>
        <button
          v-if="collapsed"
          type="button"
          class="min-w-0 flex-1 truncate rounded-md px-1 py-1.5 text-left text-sm transition hover:bg-slate-50"
          @click="emit('toggle')"
        >
          <span class="font-bold text-rail">{{ name }}</span>
          <span class="text-rail-soft"> · {{ gist }}</span>
        </button>
        <div v-else class="min-w-0 flex-1 text-center">
          <h3 class="truncate text-base font-bold leading-tight text-rail">{{ name }}</h3>
          <p v-if="pop.tier > 0" class="mt-0.5 text-xs text-amber-500">
            {{ pop.stars }} <span class="text-rail-soft">{{ pop.label }}</span>
          </p>
        </div>
        <button
          type="button"
          data-test="detail-close"
          aria-label="Fermer et rester sur la carte"
          class="shrink-0 rounded-md p-3 text-rail-soft transition hover:bg-slate-100 hover:text-rail"
          @click="emit('close')"
        >
          <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </template>

    <div v-if="!(isDrawer && collapsed)" :class="['px-3.5', isDrawer ? 'max-h-[52dvh] overflow-y-auto py-3' : 'pb-3 pt-2']">
      <p class="text-xs text-rail-soft">
        {{ fromName }} <span class="text-slate-300">→</span> {{ toName }}
        <!-- Inline has no header of its own, where the drawer shows this. -->
        <span v-if="!isDrawer && pop.tier > 0" class="text-amber-500">· {{ pop.stars }} <span class="text-rail-soft">{{ pop.label }}</span></span>
      </p>

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

        <ul class="mt-2.5 flex flex-col gap-1">
          <li
            v-for="t in outbound"
            :key="`out-${t.departure}-${t.trainNumber}`"
            data-test="detail-train"
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

        <template v-if="mode === 'roundtrip' && destination.returnTrains?.length">
          <p class="mt-3 text-xs font-semibold uppercase tracking-wide text-coral-strong">
            Retour vers {{ originName }}
          </p>
          <ul class="mt-1.5 flex flex-col gap-1">
            <li
              v-for="t in destination.returnTrains"
              :key="`back-${t.departure}-${t.trainNumber}`"
              data-test="detail-return"
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

      <template v-if="mode === 'from'">
        <button
          v-if="!returns"
          type="button"
          data-test="detail-returns"
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
          <template v-else>
            <p class="mt-1 text-xs text-rail-soft">
              Choisissez une date pour chercher l'aller-retour.
            </p>
            <div class="mt-1.5 flex flex-wrap gap-1.5">
              <button
                v-for="d in returns.dates.slice(0, 14)"
                :key="d"
                type="button"
                data-test="detail-pick-return"
                class="rounded-md bg-accent/10 px-2 py-1 text-sm text-accent-strong transition hover:bg-accent/25"
                @click="emit('pick-return', destination.label, d)"
              >
                {{ formatDate(d) }}
              </button>
              <span v-if="returns.dates.length > 14" class="px-1 py-1 text-sm text-rail-soft">
                +{{ returns.dates.length - 14 }}
              </span>
            </div>
          </template>
        </div>
      </template>
    </div>

    <!-- `basis-1/2` and not `flex-1`, whose `auto` basis would split by label length. -->
    <div v-if="legSlugs && !(isDrawer && collapsed)" :class="['shrink-0 px-3.5 py-2.5', isDrawer ? 'border-t border-slate-100 bg-slate-50/60' : '']">
      <p class="text-[11px] font-medium text-rail-soft">Réserver ce trajet</p>
      <div class="mt-1.5 flex items-stretch gap-2">
        <a
          :href="sncfConnectUrl(legSlugs.from, legSlugs.to)"
          target="_blank"
          rel="noopener"
          data-test="detail-book-sncf"
          :class="[
            'flex basis-1/2 items-center justify-center rounded-lg bg-sncf px-3 font-semibold text-white transition hover:bg-sncf-hover',
            isDrawer ? 'py-3 text-sm' : 'py-2 text-xs',
          ]"
          @click="onBook('sncf_connect')"
        >
          SNCF Connect
        </a>
        <a
          :href="trainlineUrl(legSlugs.from, legSlugs.to)"
          target="_blank"
          rel="noopener"
          data-test="detail-book-trainline"
          :class="[
            'flex basis-1/2 items-center justify-center rounded-lg bg-trainline px-3 font-semibold text-white transition hover:bg-trainline-hover',
            isDrawer ? 'py-3 text-sm' : 'py-2 text-xs',
          ]"
          @click="onBook('trainline')"
        >
          Trainline
        </a>
      </div>
    </div>
  </div>
</template>
