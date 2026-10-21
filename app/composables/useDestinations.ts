import type { SearchResult } from '~~/shared/types'
import { lastBookableISO, todayISO } from '~~/shared/window'

/** One destination of a station page: where it goes, and how open the liaison is. */
export interface OpenDestination {
  label: string
  slug: string | null
  days: string[]
}

export interface Departures {
  destinations: OpenDestination[]
  /** Distinct days at least one destination is bookable, across the whole window. */
  openDays: string[]
}

/**
 * What is reachable from one station over the bookable window, resolved during server
 * rendering.
 *
 * Not `server: false` like the rest of the app: these counts are the page's only content a
 * crawler can read, and thirty station pages of pure template are what Google files under
 * "detected, currently not indexed".
 *
 * `null` on failure rather than a thrown error — unlike a liaison page, this one says nothing
 * untrue without its figures, so it degrades to its links instead of answering 503.
 */
export function useDestinations(origin: string) {
  return useAsyncData<Departures | null>(`departures:${origin}`, async () => {
    const found = await $fetch<SearchResult>(`${apiBase()}/search`, {
      query: {
        origin,
        date: todayISO(),
        dateTo: lastBookableISO(),
        mode: 'range',
      },
    }).catch((cause) => {
      console.error(`[depuis] ${origin} : l'offre de la fenêtre a échoué`, cause)
      return null
    })
    if (!found) return null

    const destinations = found.destinations
      .map((d) => ({ label: d.label, slug: d.slug ?? null, days: d.availableDates ?? [] }))
      .filter((d) => d.days.length)
      .sort((a, b) => b.days.length - a.days.length || a.label.localeCompare(b.label, 'fr'))

    return {
      destinations,
      openDays: [...new Set(destinations.flatMap((d) => d.days))].sort(),
    }
  })
}
