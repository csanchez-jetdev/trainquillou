<script setup lang="ts">
withDefaults(defineProps<{ label?: string; count?: number }>(), {
  label: 'Recherche en cours…',
  count: 4,
})
</script>

<template>
  <div class="flex h-full flex-col gap-2">
    <p class="flex items-center gap-2 px-1 text-sm text-rail-soft">
      <Spinner :size="16" />
      <span>{{ label }}</span>
    </p>
    <div class="flex flex-col gap-2">
      <div
        v-for="i in count"
        :key="i"
        class="animate-pulse rounded-xl border border-slate-200 bg-white p-3"
        :style="{ animationDelay: `${i * 90}ms` }"
      >
        <div class="flex items-center justify-between gap-2">
          <div class="h-4 w-2/5 rounded bg-slate-200" />
          <div class="h-4 w-12 rounded bg-slate-100" />
        </div>
        <div class="mt-3 flex gap-1.5">
          <div class="h-5 w-12 rounded bg-slate-100" />
          <div class="h-5 w-12 rounded bg-slate-100" />
          <div class="h-5 w-12 rounded bg-slate-100" />
        </div>
      </div>
    </div>
  </div>
</template>
