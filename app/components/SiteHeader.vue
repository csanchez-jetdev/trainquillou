<script setup lang="ts">
/** `/stats` lays its content out wider than the other pages, and its header follows. */
const { wide = false } = defineProps<{ wide?: boolean }>()

const route = useRoute()
const onLiaisons = computed(() => route.path.startsWith('/liaisons'))
const onSimulateur = computed(() => route.path.startsWith('/simulateur'))
</script>

<template>
  <header class="border-b border-slate-200 bg-white">
    <div
      class="mx-auto flex items-center justify-between px-5 py-4 sm:px-8"
      :class="wide ? 'max-w-5xl' : 'max-w-4xl'"
    >
      <NuxtLink to="/" class="flex shrink-0 items-center gap-2 font-bold tracking-tight text-rail">
        <!-- Decorative: the name follows in the same link. -->
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
      <div class="flex shrink-0 items-center gap-3 sm:gap-4">
        <!-- Hors du bandeau étroit : cinq entrées ne tiennent pas à côté du nom sur mobile. -->
        <NuxtLink
          to="/simulateur-tgvmax"
          class="-my-2 hidden py-2 text-sm font-medium whitespace-nowrap hover:underline sm:inline"
          :class="onSimulateur ? 'text-rail' : 'text-rail-soft'"
          :aria-current="onSimulateur ? 'page' : undefined"
        >
          Simulateur
        </NuxtLink>
        <NuxtLink
          to="/liaisons"
          class="-my-2 py-2 text-sm font-medium whitespace-nowrap hover:underline"
          :class="onLiaisons ? 'text-rail' : 'text-rail-soft'"
          :aria-current="onLiaisons ? 'page' : undefined"
        >
          Liaisons
        </NuxtLink>
        <GithubLink class="-m-2 p-2 text-rail-soft transition hover:text-rail" />
        <NuxtLink to="/app" class="-my-2 py-2 text-sm font-medium whitespace-nowrap text-accent-strong hover:underline">
          <!-- The full wording does not fit next to three other items on a narrow screen. -->
          <span class="hidden sm:inline">Ouvrir l'application →</span>
          <span class="sm:hidden">L'app →</span>
        </NuxtLink>
      </div>
    </div>
  </header>
</template>
