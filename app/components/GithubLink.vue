<script setup lang="ts">
/** The repo URL is written here and nowhere else: under AGPL-3.0 it has to stay reachable
 *  from every screen. */
defineProps<{
  /** Text next to the mark. Absent: icon-only link (app bar). */
  label?: string
}>()

const REPO = 'https://github.com/csanchez-jetdev/trainquillou'
</script>

<template>
  <a
    :href="REPO"
    target="_blank"
    rel="noopener"
    :title="label ? undefined : 'Code source sur GitHub'"
    :aria-label="label ? undefined : 'Code source sur GitHub'"
    class="inline-flex items-center gap-1.5"
  >
    <svg class="h-[1.15em] w-[1.15em] shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .5C5.73.5.9 5.4.9 11.75c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2.1c-3.2.7-3.87-1.55-3.87-1.55-.52-1.35-1.28-1.71-1.28-1.71-1.05-.72.08-.71.08-.71 1.16.08 1.77 1.21 1.77 1.21 1.03 1.79 2.7 1.27 3.36.97.1-.75.4-1.27.73-1.56-2.55-.29-5.24-1.29-5.24-5.77 0-1.27.44-2.31 1.18-3.13-.12-.29-.51-1.48.11-3.08 0 0 .96-.31 3.15 1.2a10.8 10.8 0 0 1 5.74 0c2.18-1.51 3.14-1.2 3.14-1.2.62 1.6.23 2.79.11 3.08.74.82 1.18 1.86 1.18 3.13 0 4.49-2.7 5.47-5.25 5.76.41.36.78 1.08.78 2.17v3.2c0 .31.2.68.8.56 4.56-1.53 7.84-5.83 7.84-10.91C23.1 5.4 18.27.5 12 .5Z" />
    </svg>
    <span v-if="label">{{ label }}</span>
  </a>
</template>
