<script setup lang="ts">
import type { SearchMode } from "~~/shared/types";

type BarMode = SearchMode | "route";

const props = defineProps<{
    initialOrigin?: string;
    initialDestination?: string;
    initialDate?: string;
    initialDateTo?: string;
    initialStops?: string;
    initialMode?: BarMode;
    loading?: boolean;
}>();
const emit = defineEmits<{
    search: [
        {
            origin: string;
            destination?: string;
            date: string;
            dateTo?: string;
            stops?: string;
            mode: BarMode;
        },
    ];
}>();

const { suggest } = useStations();

const mode = ref<BarMode>(props.initialMode ?? "from");
const origin = ref(props.initialOrigin ?? "");
const destination = ref(props.initialDestination ?? "");
const date = ref(props.initialDate ?? "");
const dateTo = ref(props.initialDateTo ?? "");
const stops = ref(props.initialStops ?? "2");
const error = ref("");

const showOriginSug = ref(false);
const showDestSug = ref(false);
const originSug = computed(() => suggest(origin.value));
const destSug = computed(() => suggest(destination.value));
const today = new Date().toISOString().slice(0, 10);

const MODES: Array<{ key: BarMode; label: string }> = [
    { key: "from", label: "Depuis" },
    { key: "to", label: "Vers" },
    { key: "roundtrip", label: "Aller-retour" },
    { key: "range", label: "Plusieurs jours" },
    { key: "route", label: "Itinéraire" },
];

/** Les modes à deux dates : plage d'exploration, ou date de retour. */
const hasSecondDate = computed(
    () => mode.value === "range" || mode.value === "roundtrip",
);

const originLabel = computed(() => {
    if (mode.value === "to") return "Gare d'arrivée";
    return "Gare de départ";
});
const submitLabel = computed(() => {
    if (mode.value === "to") return "D'où peut-on venir ?";
    if (mode.value === "roundtrip") return "Voir les escapades";
    if (mode.value === "route") return "Chercher l'itinéraire";
    return "Voir les destinations";
});

function pickOrigin(label: string) {
    origin.value = label;
    showOriginSug.value = false;
}
function pickDest(label: string) {
    destination.value = label;
    showDestSug.value = false;
}
// Délai au blur pour laisser le clic sur une suggestion s'enregistrer.
function closeOriginSug() {
    setTimeout(() => (showOriginSug.value = false), 120);
}
function closeDestSug() {
    setTimeout(() => (showDestSug.value = false), 120);
}

function submit() {
    if (!origin.value.trim()) {
        error.value =
            mode.value === "to"
                ? "Choisissez une gare d'arrivée."
                : "Choisissez une gare de départ.";
        return;
    }
    if (mode.value === "route" && !destination.value.trim()) {
        error.value = "Choisissez une gare d'arrivée.";
        return;
    }
    if (!date.value) {
        error.value = "Choisissez une date.";
        return;
    }
    if (hasSecondDate.value) {
        if (!dateTo.value) {
            error.value =
                mode.value === "roundtrip"
                    ? "Choisissez une date de retour."
                    : "Choisissez une date de fin.";
            return;
        }
        if (dateTo.value < date.value) {
            error.value =
                mode.value === "roundtrip"
                    ? "Le retour ne peut pas précéder l'aller."
                    : "La date de fin doit suivre la date de début.";
            return;
        }
    }
    error.value = "";
    emit("search", {
        origin: origin.value.trim(),
        destination:
            mode.value === "route" ? destination.value.trim() : undefined,
        date: date.value,
        dateTo: hasSecondDate.value ? dateTo.value : undefined,
        stops: mode.value === "route" ? stops.value : undefined,
        mode: mode.value,
    });
}
</script>

<template>
    <form class="w-full" @submit.prevent="submit">
        <!-- Sélecteur de mode -->
        <div
            class="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 sm:grid-cols-5"
        >
            <button
                v-for="m in MODES"
                :key="m.key"
                type="button"
                :data-test="`mode-${m.key}`"
                :class="[
                    'rounded-md px-2 py-1.5 text-xs font-semibold transition',
                    mode === m.key
                        ? 'bg-white text-accent-strong shadow-sm'
                        : 'text-rail-soft hover:text-rail',
                ]"
                @click="mode = m.key"
            >
                {{ m.label }}
            </button>
        </div>

        <!-- Gare principale (départ, ou arrivée en mode "Vers") -->
        <div class="relative">
            <label
                class="block text-xs font-semibold uppercase tracking-wide text-rail-soft"
                >{{ originLabel }}</label
            >
            <input
                v-model="origin"
                type="text"
                placeholder="Paris, Lyon, Nantes…"
                autocomplete="off"
                role="combobox"
                :aria-expanded="showOriginSug"
                class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                @focus="showOriginSug = true"
                @input="showOriginSug = true"
                @blur="closeOriginSug"
            />
            <ul
                v-if="showOriginSug && originSug.length"
                role="listbox"
                class="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
            >
                <li
                    v-for="s in originSug"
                    :key="s"
                    role="option"
                    class="cursor-pointer px-3 py-2 hover:bg-accent/10"
                    @mousedown.prevent="pickOrigin(s)"
                >
                    {{ s }}
                </li>
            </ul>
        </div>

        <!-- Gare d'arrivée (mode itinéraire) -->
        <div v-if="mode === 'route'" class="relative mt-3">
            <label
                class="block text-xs font-semibold uppercase tracking-wide text-rail-soft"
                >Gare d'arrivée</label
            >
            <input
                v-model="destination"
                type="text"
                placeholder="Destination finale…"
                autocomplete="off"
                role="combobox"
                :aria-expanded="showDestSug"
                class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                @focus="showDestSug = true"
                @input="showDestSug = true"
                @blur="closeDestSug"
            />
            <ul
                v-if="showDestSug && destSug.length"
                role="listbox"
                class="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg"
            >
                <li
                    v-for="s in destSug"
                    :key="s"
                    role="option"
                    class="cursor-pointer px-3 py-2 hover:bg-accent/10"
                    @mousedown.prevent="pickDest(s)"
                >
                    {{ s }}
                </li>
            </ul>
        </div>

        <div class="mt-3 flex gap-2">
            <div class="flex-1">
                <label
                    class="block text-xs font-semibold uppercase tracking-wide text-rail-soft"
                >
                    {{
                        mode === "range"
                            ? "Du"
                            : mode === "roundtrip"
                              ? "Aller"
                              : "Date"
                    }}
                </label>
                <input
                    v-model="date"
                    type="date"
                    :min="today"
                    class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
            </div>
            <div v-if="hasSecondDate" class="flex-1">
                <label
                    class="block text-xs font-semibold uppercase tracking-wide text-rail-soft"
                    >{{ mode === "roundtrip" ? "Retour" : "Au" }}</label
                >
                <input
                    v-model="dateTo"
                    type="date"
                    data-test="date-to"
                    :min="date || today"
                    class="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                />
            </div>
            <div v-if="mode === 'route'" class="w-32">
                <label
                    class="block text-xs font-semibold uppercase tracking-wide text-rail-soft"
                    >Correspondances</label
                >
                <select
                    v-model="stops"
                    data-test="stops-select"
                    class="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
                >
                    <option value="0">Direct</option>
                    <option value="1">≤ 1</option>
                    <option value="2">≤ 2</option>
                    <option value="3">≤ 3 (plus lent)</option>
                </select>
            </div>
        </div>

        <p v-if="error" class="mt-2 text-sm text-red-600">{{ error }}</p>

        <button
            type="submit"
            :disabled="loading"
            class="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-accent to-accent-strong px-4 py-2.5 font-semibold text-white shadow-sm shadow-accent/30 transition hover:shadow-md hover:brightness-105 disabled:opacity-70"
        >
            <Spinner v-if="loading" :size="16" />
            <span>{{ loading ? "Recherche…" : submitLabel }}</span>
        </button>
    </form>
</template>
