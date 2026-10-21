import type { LiaisonResult, RouteResult } from '~~/shared/types'
import { ROUTE_PAGES, stationBySlug } from '~~/shared/stations'
import { todayISO } from '~~/shared/window'

/** A liaison, plus what the page needs when no direct train runs at all. */
export interface Liaison extends LiaisonResult {
  connections: RouteResult['itineraries']
}

/**
 * Everything one origin-destination page shows, resolved during server rendering.
 *
 * Unlike the rest of the app, this one is not `server: false`: the dates are the page's
 * content, and a crawler that runs no JavaScript has to find them in the HTML.
 */
export function useLiaison(from: string, to: string) {
  return useAsyncData<Liaison>(`liaison:${from}:${to}`, async () => {
    const base = apiBase()
    const today = todayISO()

    // The page turns a failure into a 503 rather than a wrong claim, but the reason only
    // exists here: named, the difference between an unresolved host, a refused connection
    // and a rejected parameter is one log line instead of an afternoon.
    const fail = (step: string) => (cause: unknown) => {
      console.error(`[liaison] ${from} → ${to} : ${step} a échoué sur ${base}`, cause)
      throw cause
    }

    const liaison = await $fetch<LiaisonResult>(`${base}/liaison`, {
      query: { origin: from, dest: to, from: today },
    }).catch(fail('la liaison'))

    if (liaison.days.length) return { ...liaison, connections: [] }

    const composed = await $fetch<RouteResult>(`${base}/route`, {
      query: { from, to, date: today, stops: '2' },
    }).catch(fail('les correspondances'))
    return { ...liaison, connections: composed.itineraries }
  })
}

/** One entry of the liaison index: the pair, and what came back for it. */
export interface IndexedLiaison {
  from: string
  to: string
  liaison: LiaisonResult | null
}

/**
 * The whole index, one call per pair.
 *
 * `allSettled`, never `all`: the index's job is to link the twenty-seven pages, and it does
 * that job with or without the figures. A pair that fails renders as it does today — a link
 * and a name — instead of taking the page down.
 */
export function useLiaisonIndex() {
  return useAsyncData<IndexedLiaison[]>('liaisons:index', async () => {
    const base = apiBase()
    const today = todayISO()

    const answers = await Promise.allSettled(
      ROUTE_PAGES.map(({ from, to }) =>
        $fetch<LiaisonResult>(`${base}/liaison`, {
          query: {
            origin: stationBySlug(from)?.label ?? from,
            dest: stationBySlug(to)?.label ?? to,
            from: today,
          },
        })),
    )

    const failed = answers.filter((a) => a.status === 'rejected')
    if (failed.length) {
      console.error(`[liaisons] ${failed.length} liaisons sur ${answers.length} sans réponse`, failed[0])
    }

    return ROUTE_PAGES.map(({ from, to }, i) => {
      const answer = answers[i]!
      return { from, to, liaison: answer.status === 'fulfilled' ? answer.value : null }
    })
  })
}
