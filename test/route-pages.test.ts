import { describe, it, expect } from 'vitest'
import { ROUTE_PAGES, STATION_PAGES, routeBySlugs, routesFrom } from '~~/shared/stations'
import booking from '~~/shared/booking.json'

const stationSlugs = new Set(STATION_PAGES.map((s) => s.slug))
const bookingSlugs = new Set(Object.values(booking as Record<string, { slug: string }>).map((e) => e.slug))

describe('pages de liaison', () => {
  it('publie une liste non vide et de taille assumée', () => {
    // Le plafond n'est pas technique : une liaison de plus est une décision, pas un effet
    // de bord d'un script qu'on relance.
    expect(ROUTE_PAGES.length).toBeGreaterThan(0)
    expect(ROUTE_PAGES.length).toBeLessThanOrEqual(60)
  })

  it('ne nomme que des gares que le référentiel connaît', () => {
    for (const { from, to } of ROUTE_PAGES) {
      expect(bookingSlugs.has(from), `${from} absent de booking.json`).toBe(true)
      expect(bookingSlugs.has(to), `${to} absent de booking.json`).toBe(true)
    }
  })

  it('a une page /depuis/ à chaque extrémité', () => {
    // Le fil d'ariane et le maillage remontent vers `/depuis/<gare>` : une extrémité sans
    // page ferait un parent en 404.
    for (const { from, to } of ROUTE_PAGES) {
      expect(stationSlugs.has(from), `/depuis/${from} manquante`).toBe(true)
      expect(stationSlugs.has(to), `/depuis/${to} manquante`).toBe(true)
    }
  })

  it('ne relie pas une gare à elle-même et ne se répète pas', () => {
    const seen = new Set<string>()
    for (const { from, to } of ROUTE_PAGES) {
      expect(from).not.toBe(to)
      const key = `${from}|${to}`
      expect(seen.has(key), `${key} en double`).toBe(false)
      seen.add(key)
    }
  })

  it('se retrouve par ses slugs, et refuse ce qui n\'est pas publié', () => {
    const first = ROUTE_PAGES[0]!
    expect(routeBySlugs(first.from, first.to)).toEqual(first)
    expect(routeBySlugs(first.to, 'gare-inexistante')).toBeUndefined()
  })

  it('regroupe les liaisons par gare de départ', () => {
    const first = ROUTE_PAGES[0]!
    const leaving = routesFrom(first.from)
    expect(leaving.length).toBeGreaterThan(0)
    expect(leaving.every((r) => r.from === first.from)).toBe(true)
  })
})
