<script setup lang="ts">
import type { SearchMode } from '~~/shared/types'
import { todayISO, lastBookableISO, BOOKING_WINDOW_DAYS } from '~~/shared/window'
import { cleanString } from '~~/server/utils/normalize'

type BarMode = SearchMode | 'route'
/** Comment les dates sont choisies. Le mode de recherche en découle, il n'est plus choisi. */
type DateKind = 'single' | 'roundtrip' | 'range'

const props = defineProps<{
  initialOrigin?: string
  initialDestination?: string
  initialDate?: string
  initialDateTo?: string
  initialStops?: string
  initialMode?: BarMode
  loading?: boolean
}>()
const emit = defineEmits<{
  search: [{ origin: string; destination?: string; date: string; dateTo?: string; stops?: string; mode: BarMode }]
}>()

/**
 * Les cinq modes de recherche ne sont pas cinq choix à faire, mais la conséquence de trois
 * champs : quelle gare de départ, quelle gare d'arrivée (vide = n'importe où), et comment
 * les dates sont choisies. On saisit une intention, l'application en déduit le mode.
 */
const from = ref('')
const to = ref('')
const dateKind = ref<DateKind>('single')
const date = ref(props.initialDate ?? '')
const dateTo = ref(props.initialDateTo ?? '')
const stops = ref(props.initialStops ?? '2')
const error = ref('')

// L'URL reste la source de vérité et porte toujours `mode` : on rétablit l'état des champs
// qui produit ce mode, pour qu'un lien partagé ou la page d'accueil ouvrent le bon écran.
{
  const m = props.initialMode ?? 'from'
  if (m === 'to') to.value = props.initialOrigin ?? ''
  else from.value = props.initialOrigin ?? ''
  if (m === 'route') to.value = props.initialDestination ?? ''
  if (m === 'roundtrip') dateKind.value = 'roundtrip'
  if (m === 'range') dateKind.value = 'range'
}

// Les places à 0 € n'ouvrent que 30 jours avant le départ : au-delà, le jeu de données
// SNCF est vide et une recherche ne renverrait rien, ce qui se lirait comme une panne.
// Le sélecteur natif refuse donc ces dates plutôt que de laisser aller dans le mur.
const today = todayISO()
const lastBookable = lastBookableISO()

const hasFrom = computed(() => Boolean(from.value.trim()))
const hasTo = computed(() => Boolean(to.value.trim()))

/** Aller d'une ville vers elle-même : le dataset le permet (Part-Dieu → Perrache), pas nous. */
const sameStation = computed(
  () => hasFrom.value && hasTo.value && cleanString(from.value) === cleanString(to.value),
)

/**
 * Intention reçue de l'URL (`/app?mode=to`), tant qu'aucune gare n'est saisie : un
 * formulaire vide ne peut pas exprimer à lui seul « je cherche à l'envers ». Dès que
 * l'on saisit quelque chose, ce sont les champs qui décident.
 */
const pendingMode = ref<BarMode | null>(
  props.initialMode === 'to' || props.initialMode === 'route' ? props.initialMode : null,
)
watch([from, to], () => (pendingMode.value = null))

/** Aller-retour et plage n'ont de sens que sans gare d'arrivée fixée. */
const canPickDateKind = computed(() => !hasTo.value)
watch(canPickDateKind, (ok) => {
  if (!ok) dateKind.value = 'single'
})

const mode = computed<BarMode>(() => {
  if (hasFrom.value && hasTo.value) return 'route'
  if (hasTo.value) return 'to'
  if (!hasFrom.value && pendingMode.value) return pendingMode.value
  if (dateKind.value === 'roundtrip') return 'roundtrip'
  if (dateKind.value === 'range') return 'range'
  return 'from'
})

const hasSecondDate = computed(() => dateKind.value !== 'single' && canPickDateKind.value)

const HINTS: Record<BarMode, string> = {
  from: 'Toutes les villes joignables ce jour-là. Renseignez « Vers » pour composer un trajet précis.',
  to: 'Recherche inversée : toutes les villes d\'où l\'on peut rejoindre cette gare.',
  roundtrip: 'Seules les villes dont l\'aller et le retour sont réservables aux deux dates.',
  range: 'Les villes joignables sur la période, avec le nombre de jours possibles pour chacune.',
  route: 'Trajet composé avec correspondances, quand aucun TGVmax direct n\'existe.',
}
const hint = computed(() => {
  // Formulaire vide et sans intention particulière : c'est le moment d'annoncer que la
  // gare d'arrivée est facultative, et ce que ça change de la laisser vide.
  if (!hasFrom.value && !hasTo.value && mode.value === 'from') {
    return 'Indiquez une gare de départ — ou seulement une gare d\'arrivée pour chercher à l\'envers.'
  }
  return HINTS[mode.value]
})

function humanDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long',
  })
}

const SUBMIT_LABELS: Record<BarMode, string> = {
  from: 'Voir les destinations',
  to: 'D\'où peut-on venir ?',
  roundtrip: 'Voir les escapades',
  range: 'Explorer la période',
  route: 'Chercher l\'itinéraire',
}
const submitLabel = computed(() => SUBMIT_LABELS[mode.value])

const firstDateLabel = computed(() => {
  if (dateKind.value === 'range') return 'Du'
  if (dateKind.value === 'roundtrip') return 'Aller'
  return 'Date'
})

function swap() {
  const previous = from.value
  from.value = to.value
  to.value = previous
}

function submit() {
  if (sameStation.value) {
    error.value = 'Les deux gares sont identiques.'
    return
  }
  if (mode.value === 'route' && (!hasFrom.value || !hasTo.value)) {
    error.value = 'Indiquez la gare de départ et la gare d\'arrivée.'
    return
  }
  if (!hasFrom.value && !hasTo.value) {
    error.value = 'Choisissez au moins une gare.'
    return
  }
  if (!date.value) {
    error.value = 'Choisissez une date.'
    return
  }
  // Un lien partagé peut porter une date sortie de la fenêtre depuis son envoi.
  if (date.value < today || date.value > lastBookable) {
    error.value = `Les places ne sont réservables que jusqu'au ${humanDate(lastBookable)}.`
    return
  }
  if (hasSecondDate.value) {
    if (!dateTo.value) {
      error.value = dateKind.value === 'roundtrip' ? 'Choisissez une date de retour.' : 'Choisissez une date de fin.'
      return
    }
    if (dateTo.value < date.value) {
      error.value = dateKind.value === 'roundtrip'
        ? 'Le retour ne peut pas précéder l\'aller.'
        : 'La date de fin doit suivre la date de début.'
      return
    }
    if (dateTo.value > lastBookable) {
      error.value = `Les places ne sont réservables que jusqu'au ${humanDate(lastBookable)}.`
      return
    }
  }
  error.value = ''
  emit('search', {
    // En recherche inversée, la gare cherchée est celle d'arrivée : c'est elle le pivot.
    origin: (mode.value === 'to' ? to.value : from.value).trim(),
    destination: mode.value === 'route' ? to.value.trim() : undefined,
    date: date.value,
    dateTo: hasSecondDate.value ? dateTo.value : undefined,
    stops: mode.value === 'route' ? stops.value : undefined,
    mode: mode.value,
  })
}
</script>

<template>
  <!--
    Deux dispositions. En colonne sur mobile, comme un formulaire. En barre horizontale à
    partir de `md` : empilés dans une colonne de 384 px, ces quatre contrôles prenaient
    309 px de haut, soit plus que la liste de résultats qu'ils produisent.

    `flex-wrap` plutôt qu'un troisième palier de largeur : la barre se plie d'elle-même en
    deux rangées là où elle ne tient plus, entre 768 et 1 000 px, et la mise en page reste
    binaire — colonne ou barre.

    L'ordre suit la disposition, via `order` : le bouton vient après les champs sur la
    barre, mais reste sous le texte qui annonce ce qu'il va faire en colonne.
  -->
  <form class="flex w-full flex-col gap-2 md:flex-row md:flex-wrap" @submit.prevent="submit">
    <!-- Le trajet : un seul objet, pas deux champs juxtaposés. Le bouton d'inversion se
         pose sur le séparateur qu'il fait pivoter — sur le bord droit du cadre en colonne,
         entre les deux champs sur la barre. -->
    <!-- `md:min-w-[24rem]` : le plancher sous lequel la barre se plie plutôt que de
         comprimer les champs davantage. En dessous de 1 100 px et dans les modes à trois
         cellules de date, un long libellé s'y tronque encore — « LYON (intr » — et c'est
         assumé : la gare est réécrite en entier dans l'en-tête des résultats juste dessous,
         et la hauteur rendue à la liste est ce qu'on est venu chercher. -->
    <div class="relative order-1 rounded-xl border border-slate-200 bg-white md:flex md:min-w-[24rem] md:flex-1 md:items-stretch">
      <StationInput
        v-model="from"
        label="Depuis"
        placeholder="Paris, Lyon, Nantes…"
        test-id="input-from"
        :exclude="to"
        class="md:min-w-0 md:flex-1"
      />
      <div class="mx-3 h-px bg-slate-100 md:mx-0 md:h-auto md:w-px md:shrink-0" />
      <!-- `md:pl-4` : de quoi dégager le libellé du bouton d'inversion, qui se centre sur
           le séparateur et empiète de 16 px de chaque côté. -->
      <StationInput
        v-model="to"
        label="Vers"
        placeholder="N'importe où"
        test-id="input-to"
        :exclude="from"
        class="md:min-w-0 md:flex-1 md:pl-4"
      />
      <button
        type="button"
        data-test="swap"
        title="Inverser le sens"
        aria-label="Inverser le sens de la recherche"
        class="absolute right-2.5 top-1/2 z-10 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-rail-soft shadow-sm transition hover:border-accent hover:text-accent-strong md:left-1/2 md:right-auto md:-translate-x-1/2 md:rotate-90"
        @click="swap"
      >
        <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" />
        </svg>
      </button>
    </div>

    <!-- Quand : même traitement, un cadre unique découpé en cellules.
         `md:contents` sur les rangées : sur la barre elles s'effacent et leurs cellules
         deviennent directement celles du cadre, sans dupliquer le balisage ni maintenir
         deux arborescences. Leur `border-t`, qui séparait les rangées empilées, disparaît
         avec elles. -->
    <!-- `md:flex-none` : ce cadre est dimensionné par son contenu, jamais comprimé. Il
         compte deux cellules, trois en aller-retour ou en itinéraire ; avec un ratio de
         croissance, la troisième débordait sous le bouton de recherche en dessous de
         1 100 px. Seul le cadre du trajet s'étire, ses champs en ont l'usage. -->
    <div class="order-2 rounded-xl border border-slate-200 bg-white md:flex md:flex-none md:items-stretch">
      <div class="grid grid-cols-2 md:contents">
        <div class="px-3 py-2 md:min-w-[8.5rem] md:flex-1">
          <span class="block text-xs font-medium text-rail-soft">{{ firstDateLabel }}</span>
          <input
            v-model="date"
            type="date"
            :min="today"
            :max="lastBookable"
            class="mt-0.5 w-full bg-transparent text-[15px] font-medium text-rail outline-none"
          >
        </div>
        <div class="relative border-l border-slate-100 px-3 py-2 md:min-w-[9rem] md:flex-1">
          <label for="tq-date-kind" class="block text-xs font-medium text-rail-soft">Voyage</label>
          <select
            id="tq-date-kind"
            v-model="dateKind"
            data-test="date-kind"
            class="mt-0.5 w-full appearance-none bg-transparent pr-5 text-[15px] font-medium text-rail outline-none disabled:text-rail-soft"
            :disabled="!canPickDateKind"
          >
            <option value="single">Aller simple</option>
            <option value="roundtrip">Aller-retour</option>
            <option value="range">Plusieurs jours</option>
          </select>
          <svg class="pointer-events-none absolute bottom-3 right-3 h-3.5 w-3.5 text-rail-soft" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>

      <!-- Ces lignes n'ont qu'une cellule, mais gardent la grille à deux colonnes en
           colonne : sinon leur champ s'étire sur toute la largeur et son icône de
           calendrier ne tombe plus en face de celle de la ligne du dessus.
           Les deux sont exclusives — une plage de dates suppose une arrivée libre, un
           itinéraire suppose une arrivée fixée — donc jamais plus d'une cellule ici. -->
      <div v-if="hasSecondDate" class="grid grid-cols-2 border-t border-slate-100 md:contents">
        <div class="px-3 py-2 md:min-w-[8.5rem] md:flex-1 md:border-l md:border-slate-100">
          <span class="block text-xs font-medium text-rail-soft">
            {{ dateKind === 'roundtrip' ? 'Retour' : 'Au' }}
          </span>
          <input
            v-model="dateTo"
            type="date"
            data-test="date-to"
            :min="date || today"
            :max="lastBookable"
            class="mt-0.5 w-full bg-transparent text-[15px] font-medium text-rail outline-none"
          >
        </div>
      </div>

      <div v-if="mode === 'route'" class="grid grid-cols-2 border-t border-slate-100 md:contents">
        <div class="relative px-3 py-2 md:min-w-[9rem] md:flex-1 md:border-l md:border-slate-100">
          <label for="tq-stops" class="block text-xs font-medium text-rail-soft">Correspondances</label>
          <select
            id="tq-stops"
            v-model="stops"
            data-test="stops-select"
            class="mt-0.5 w-full appearance-none bg-transparent pr-5 text-[15px] font-medium text-rail outline-none"
          >
            <option value="0">Direct</option>
            <option value="1">≤ 1</option>
            <option value="2">≤ 2</option>
            <option value="3">≤ 3 (plus lent)</option>
          </select>
          <svg class="pointer-events-none absolute bottom-3 right-3 h-3.5 w-3.5 text-rail-soft" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>
    </div>

    <!--
      Les deux textes d'aide. Empilés en colonne, sur une seule ligne sur la barre : ils y
      tiennent côte à côte et coûtent alors 18 px au lieu de 63. Aucun des deux n'est
      supprimé pour autant — le premier est le seul endroit où le mode de recherche est
      dit, puisqu'il n'est plus nommé nulle part, et le second explique pourquoi le
      sélecteur de date s'arrête.
    -->
    <div class="order-3 flex flex-col gap-1 px-0.5 md:order-4 md:w-full md:flex-row md:flex-wrap md:items-baseline md:gap-x-2">
      <!-- Ce que la recherche va faire, en clair. -->
      <p
        v-if="sameStation"
        data-test="same-station"
        class="text-xs leading-snug font-medium text-amber-600"
      >
        Départ et arrivée sont la même ville : choisissez-en une autre, ou videz « Vers » pour
        voir toutes les destinations.
      </p>
      <p v-else data-test="search-hint" class="text-xs leading-snug text-rail-soft">
        {{ hint }}
      </p>

      <!-- La règle des 30 jours vient de l'abonnement, pas de l'application : sans elle, un
           champ date qui refuse le mois prochain passe pour un bug. -->
      <p class="text-[11px] leading-snug text-rail-soft/80">
        Les places à 0 € ouvrent {{ BOOKING_WINDOW_DAYS }} jours avant le départ : réservable
        jusqu'au {{ humanDate(lastBookable) }}.
      </p>
    </div>

    <p v-if="error" class="order-4 px-0.5 text-sm text-red-600 md:order-5 md:w-full">{{ error }}</p>

    <!-- Le bouton se désactive sur deux gares identiques : l'explication est juste
         au-dessus, inutile de laisser cliquer pour la répéter en rouge. La validation
         dans `submit` reste nécessaire, la touche Entrée soumettant le formulaire même
         quand son bouton est désactivé. -->
    <button
      type="submit"
      :disabled="loading || sameStation"
      :class="[
        'order-5 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white transition md:order-3 md:w-auto md:shrink-0',
        // Grisé sur une saisie invalide, mais toujours accent pendant le chargement :
        // une recherche en cours n'est pas une erreur.
        sameStation ? 'cursor-not-allowed bg-slate-300' : 'bg-accent hover:bg-accent-strong disabled:opacity-70',
      ]"
    >
      <Spinner v-if="loading" :size="16" />
      <span>{{ loading ? 'Recherche…' : submitLabel }}</span>
    </button>
  </form>
</template>
