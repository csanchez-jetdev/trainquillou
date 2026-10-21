<script setup lang="ts">
import type { Itinerary, RouteResult } from '~~/shared/types'
import { bookingSlug, prettyLabel } from '~~/shared/stations'
import { cleanString } from '~~/shared/normalize'
import { sncfConnectUrl, trainlineUrl } from '~/utils/booking'

const props = defineProps<{
  route: (RouteResult & { truncated?: boolean }) | null | undefined
  pending: boolean
  error: unknown
  selected: number
}>()
const emit = defineEmits<{ select: [number]; retry: []; 'pick-date': [string] }>()

interface BookableLeg { from: string; to: string; fromSlug: string; toSlug: string }

/**
 * Both sites only address a pair of cities: a trip with connections is booked leg by leg.
 * All or nothing — a partial list would present an incomplete trip as the whole journey.
 */
function bookableLegs(it: Itinerary): BookableLeg[] {
  const legs = it.legs.map((l) => ({
    from: prettyLabel(l.from),
    to: prettyLabel(l.to),
    fromSlug: bookingSlug(cleanString(l.from)),
    toSlug: bookingSlug(cleanString(l.to)),
  }))
  return legs.every((l): l is BookableLeg => Boolean(l.fromSlug && l.toSlug)) ? legs : []
}

const bookable = computed(() => (props.route?.itineraries ?? []).map(bookableLegs))

const suggestions = computed(() => props.route?.alsoAvailable ?? [])

/** A whole month of dates is a wall; the fold sits lower when the day asked for came up empty. */
const showAll = ref(false)
watch(() => [props.route?.date, props.route?.from.label, props.route?.to.label], () => {
  showAll.value = false
})
const shown = computed(() => {
  if (showAll.value) return suggestions.value
  return suggestions.value.slice(0, props.route?.itineraries.length ? 6 : 14)
})

function onBook(provider: 'sncf_connect' | 'trainline', destination: string) {
  track('booking_click', { provider, destination, mode: 'route' })
}

function fmtDuration(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`
}

function fmtDay(iso: string): string {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('fr-FR', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}
</script>

<template>
  <!-- `pb-14` on mobile: the floating map/list toggle would cover the last block. -->
  <div class="flex h-full flex-col gap-2 pb-14 md:pb-0">
    <LoadingCards v-if="pending" label="Recherche d'itinéraires…" :count="3" />

    <div v-else-if="error" class="p-4">
      <p class="text-red-600">Impossible de calculer l'itinéraire.</p>
      <button class="mt-2 rounded-md bg-rail px-3 py-1.5 text-sm text-white" @click="emit('retry')">
        Réessayer
      </button>
    </div>

    <template v-else-if="route">
      <p class="px-1 text-sm text-rail-soft">
        <strong class="text-rail">{{ route.from.label }}</strong> →
        <strong class="text-rail">{{ route.to.label }}</strong>
        <template v-if="route.itineraries.length">
          · {{ route.itineraries.length }}
          {{ route.itineraries.length > 1 ? 'itinéraires' : 'itinéraire' }}
        </template>
      </p>
      <p v-if="route.truncated" class="px-1 text-[11px] text-amber-700">
        Exploration partielle (budget d'appels atteint) : d'autres trajets à 2 correspondances peuvent exister.
      </p>

      <ul v-if="route.itineraries.length" class="flex flex-col gap-2 overflow-auto pr-1">
        <li
          v-for="(it, i) in route.itineraries"
          :key="i"
          :data-test="'itinerary'"
          :class="[
            'min-w-0 rounded-xl border p-3 transition',
            route.itineraries.length > 1 ? 'cursor-pointer' : '',
            i === selected ? 'border-accent bg-accent/5 shadow-md' : 'border-slate-200 bg-white hover:border-accent',
          ]"
          @mouseenter="emit('select', i)"
          @click="emit('select', i)"
        >
          <!-- The whole summary is the selection control, so the card is reachable by keyboard. -->
          <button
            type="button"
            class="flex w-full cursor-[inherit] items-center justify-between gap-2 text-left"
            :aria-expanded="i === selected"
            @click="emit('select', i)"
          >
            <span class="font-semibold text-rail">{{ it.departure }} → {{ it.arrival }}</span>
            <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-rail-soft">
              {{ it.stops === 0 ? 'Direct' : `${it.stops} corresp.` }} · {{ fmtDuration(it.durationMin) }}
            </span>
          </button>
          <ol class="mt-2 space-y-1">
            <li
              v-for="(l, j) in it.legs"
              :key="j"
              class="flex items-baseline gap-2 text-sm text-rail-soft"
            >
              <!-- Same colour as this leg drawn on the map. -->
              <span
                v-if="it.legs.length > 1"
                class="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                :style="{ background: i === selected ? legColor(j) : 'var(--color-slate-300)' }"
              />
              <span class="tabular-nums text-rail">{{ l.departure }}</span>
              <span class="truncate">{{ l.from }}</span>
              <span class="text-slate-300">→</span>
              <span class="tabular-nums text-rail">{{ l.arrival }}</span>
              <span class="truncate">{{ l.to }}</span>
              <span v-if="l.trainNumber" class="ml-auto shrink-0 text-xs text-rail-soft">
                n°{{ l.trainNumber }}
              </span>
            </li>
          </ol>

          <div v-if="i === selected && bookable[i]!.length" class="mt-3 border-t border-slate-200/70 pt-2.5">
            <p class="text-[11px] font-medium text-rail-soft">
              {{ bookable[i]!.length > 1 ? 'Un billet par tronçon :' : 'Réserver ce trajet' }}
            </p>
            <div v-if="bookable[i]!.length === 1" class="mt-1.5 flex items-stretch gap-2">
              <a
                :href="sncfConnectUrl(bookable[i]![0]!.fromSlug, bookable[i]![0]!.toSlug)"
                target="_blank"
                rel="noopener"
                data-test="route-book-sncf"
                class="flex min-h-11 basis-1/2 items-center justify-center rounded-lg bg-sncf px-3 text-sm font-semibold text-white transition hover:bg-sncf-hover"
                @click="onBook('sncf_connect', bookable[i]![0]!.to)"
              >
                SNCF Connect
              </a>
              <a
                :href="trainlineUrl(bookable[i]![0]!.fromSlug, bookable[i]![0]!.toSlug)"
                target="_blank"
                rel="noopener"
                data-test="route-book-trainline"
                class="flex min-h-11 basis-1/2 items-center justify-center rounded-lg bg-trainline px-3 text-sm font-semibold text-white transition hover:bg-trainline-hover"
                @click="onBook('trainline', bookable[i]![0]!.to)"
              >
                Trainline
              </a>
            </div>
            <ul v-else class="mt-1.5 flex flex-col gap-1.5">
              <li v-for="(l, k) in bookable[i]" :key="k">
                <a
                  :href="sncfConnectUrl(l.fromSlug, l.toSlug)"
                  target="_blank"
                  rel="noopener"
                  data-test="route-book-leg"
                  class="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-rail transition hover:border-sncf hover:bg-slate-50"
                  @click="onBook('sncf_connect', l.to)"
                >
                  <span class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sncf text-[11px] font-semibold text-white">
                    {{ k + 1 }}
                  </span>
                  <span class="truncate">{{ l.from }} → {{ l.to }}</span>
                  <span class="ml-auto shrink-0 text-xs font-semibold text-sncf">SNCF Connect</span>
                </a>
              </li>
            </ul>
          </div>
        </li>
      </ul>
      <div v-else class="px-1 py-3">
        <p class="font-display font-bold text-rail">Aucun TGVmax ce jour-là.</p>
        <p v-if="!suggestions.length" class="mt-1 text-sm text-rail-soft">
          Aucun non plus sur le reste de la fenêtre réservable,
          {{ route.maxStops ? 'même avec une correspondance' : 'en direct' }}.
          <template v-if="!route.maxStops">Autorisez des correspondances pour élargir.</template>
        </p>
        <p v-else class="mt-1 text-sm text-rail-soft">
          {{ suggestions.length }}
          {{ suggestions.length > 1 ? 'autres dates fonctionnent' : 'autre date fonctionne' }}
          d'ici le {{ fmtDay(suggestions[suggestions.length - 1]!) }}
        </p>
      </div>

      <div v-if="suggestions.length" :class="route.itineraries.length ? 'mt-1 border-t border-slate-100 pt-2' : 'px-1'">
        <p v-if="route.itineraries.length" class="px-1 text-xs text-rail-soft">
          Autres dates possibles :
        </p>
        <div class="mt-1 flex flex-wrap gap-1.5 px-1">
          <button
            v-for="d in shown"
            :key="d"
            type="button"
            data-test="also-day"
            class="min-h-9 rounded-full bg-accent/10 px-2.5 text-sm font-medium text-accent-strong transition hover:bg-accent/20"
            @click="emit('pick-date', d)"
          >
            {{ fmtDay(d) }}
          </button>
          <button
            v-if="shown.length < suggestions.length"
            type="button"
            class="min-h-9 px-1 text-sm font-medium text-rail-soft underline underline-offset-2 hover:text-rail"
            @click="showAll = true"
          >
            +{{ suggestions.length - shown.length }}
          </button>
        </div>
      </div>
    </template>

    <div v-else class="p-4 text-rail-soft">
      Choisissez une gare de départ, une gare d'arrivée et une date pour composer un trajet TGVmax.
    </div>
  </div>
</template>
