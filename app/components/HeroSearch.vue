<script setup lang="ts">
import { todayISO, lastBookableISO } from '~~/shared/window'

/**
 * Accroche de la page d'accueil : la barre de recherche elle-même, plutôt qu'un bouton
 * qui mène à elle. Un champ qui ressemble à une recherche doit chercher — un décor
 * cliquable mais impossible à remplir se lit comme une panne.
 *
 * La saisie n'est pas obligatoire : sans gare, on ouvre l'application avec la date déjà
 * posée. Le formulaire n'a donc jamais d'état invalide qui bloque le clic.
 */
const from = ref('')
const date = ref('')
const dateId = useId()

const today = todayISO()
const lastBookable = lastBookableISO()

/**
 * La date par défaut est posée au montage : calculée pendant le rendu serveur, ce serait
 * celle du serveur (UTC en production), qui désigne encore la veille entre minuit et 2 h
 * du matin en France — soit une divergence d'hydratation sur la valeur du champ.
 */
onMounted(() => (date.value = todayISO()))

function submit() {
  const origin = from.value.trim()
  const query: Record<string, string> = {}
  if (origin) query.origin = origin
  query.date = date.value || todayISO()
  return navigateTo({ path: '/app', query })
}
</script>

<template>
  <form
    class="w-full max-w-lg rounded-2xl bg-white p-2 shadow-2xl shadow-rail/40"
    @submit.prevent="submit"
  >
    <!-- Même objet que dans l'application : un cadre unique découpé en cellules -->
    <div class="rounded-xl border border-slate-200">
      <StationInput
        v-model="from"
        label="Depuis"
        placeholder="Paris, Lyon, Nantes…"
        test-id="hero-origin"
      />
      <div class="mx-3 h-px bg-slate-100" />
      <div class="flex items-center gap-2 px-3 py-2.5">
        <label :for="dateId" class="w-12 shrink-0 text-xs font-medium text-rail-soft">Date</label>
        <input
          :id="dateId"
          v-model="date"
          type="date"
          data-test="hero-date"
          :min="today"
          :max="lastBookable"
          class="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-rail outline-none"
        >
      </div>
    </div>

    <button
      type="submit"
      data-test="hero-submit"
      class="mt-2 w-full rounded-xl bg-coral px-4 py-3 text-base font-semibold text-white shadow-lg shadow-coral/30 transition hover:bg-coral-strong"
    >
      Voir les destinations →
    </button>
  </form>
</template>
