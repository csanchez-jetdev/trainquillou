<script setup lang="ts">
const { items, dismiss, hold, resume } = useToasts()
</script>

<template>
  <!-- Empty from first paint, else screen readers miss it; `bottom-28` clears the toggle. -->
  <div
    role="status"
    aria-live="polite"
    class="pointer-events-none fixed inset-x-4 bottom-28 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:items-end"
    @mouseenter="hold"
    @mouseleave="resume"
    @focusin="hold"
    @focusout="resume"
  >
    <TransitionGroup
      enter-from-class="translate-y-2 opacity-0"
      enter-active-class="transition duration-200"
      leave-to-class="translate-y-1 opacity-0"
      leave-active-class="transition duration-150"
    >
      <div
        v-for="t in items"
        :key="t.id"
        data-test="toast"
        :data-kind="t.kind"
        aria-atomic="true"
        class="pointer-events-auto flex w-full items-start gap-3 rounded-xl border-2 bg-white py-3 pl-4 pr-2 shadow-xl shadow-rail/10 sm:w-auto sm:min-w-[22rem] sm:max-w-md"
        :class="t.kind === 'error' ? 'border-red-300' : 'border-slate-200'"
      >
        <svg
          class="mt-0.5 h-5 w-5 shrink-0"
          :class="t.kind === 'error' ? 'text-red-600' : 'text-rail-soft'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <path v-if="t.kind === 'error'" d="M12 8v4M12 16h.01" />
          <path v-else d="M12 11v5M12 8h.01" />
        </svg>
        <p class="min-w-0 flex-1 py-0.5 text-[15px] font-medium leading-snug text-rail">{{ t.message }}</p>
        <button
          type="button"
          data-test="toast-close"
          aria-label="Fermer le message"
          class="-my-1 shrink-0 rounded-lg p-2.5 text-rail-soft transition hover:bg-slate-100 hover:text-rail"
          @click="dismiss(t.id)"
        >
          <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>
