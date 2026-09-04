import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { buildRailGraph, railPath, railPathThrough, distanceKm, type RailCollection, type RailSegment, type Point } from '../app/utils/rail-path'

function segment(from: Point, to: Point, v: number): RailSegment {
  return {
    type: 'Feature',
    properties: { v },
    geometry: { type: 'LineString', coordinates: [from, to] },
  }
}

const A: Point = [2, 48]
const B: Point = [3, 48]
const C: Point = [4, 48]
/** Detour: A → D → C, longer in kilometres. */
const D: Point = [3, 49]

describe('buildRailGraph', () => {
  it('welds the vertices two segments share', () => {
    const graph = buildRailGraph([segment(A, B, 160), segment(B, C, 160)])
    expect(graph.nodes).toHaveLength(3)
    expect(graph.edges.get(1)).toHaveLength(2)
  })

  it('welds vertices that are close without being identical', () => {
    const graph = buildRailGraph([segment(A, B, 160), segment([3.0002, 48.0002], C, 160)])
    expect(graph.nodes).toHaveLength(3)
  })
})

describe('railPath', () => {
  it('follows the tracks from end to end', () => {
    const graph = buildRailGraph([segment(A, B, 160), segment(B, C, 160)])
    expect(railPath(graph, A, C)).toEqual([A, B, C])
  })

  it('prefers the fast line over the short one', () => {
    const graph = buildRailGraph([
      segment(A, B, 60),
      segment(B, C, 60),
      segment(A, D, 320),
      segment(D, C, 320),
    ])
    expect(railPath(graph, A, C)).toEqual([A, D, C])
  })

  it('gives up when the network does not connect the two ends', () => {
    const graph = buildRailGraph([segment(A, B, 160), segment(C, [5, 48], 160)])
    expect(railPath(graph, A, [5, 48])).toBeNull()
  })

  it('gives up when a station has no track nearby', () => {
    const graph = buildRailGraph([segment(A, B, 160)])
    // Barcelona: the dataset stops at the border.
    expect(railPath(graph, A, [2.14, 41.38])).toBeNull()
  })
})

describe('railPathThrough', () => {
  it('chains the legs without repeating the junction', () => {
    const graph = buildRailGraph([segment(A, B, 160), segment(B, C, 160)])
    expect(railPathThrough(graph, [A, B, C])).toEqual([A, B, C])
  })

  it('falls back to the straight line for a leg it cannot route', () => {
    const graph = buildRailGraph([segment(A, B, 160)])
    const far: Point = [2.14, 41.38]
    expect(railPathThrough(graph, [A, far])).toEqual([A, far])
  })
})

/** These all return null if the proximity pass stops welding junctions. */
describe('the network in public/', () => {
  const network: RailCollection = JSON.parse(readFileSync('public/rail-network.geojson', 'utf8'))
  const graph = buildRailGraph(network.features)

  const PARIS: Point = [2.35, 48.86]
  const cities: Array<[string, Point]> = [
    ['Annecy', [6.13, 45.9]],
    ['Marseille', [5.38, 43.3]],
    ['Brest', [-4.48, 48.39]],
    ['Strasbourg', [7.74, 48.58]],
    ['Perpignan', [2.88, 42.7]],
  ]

  it.each(cities)('routes Paris to %s along the tracks', (_name, city) => {
    const path = railPath(graph, PARIS, city)
    expect(path).not.toBeNull()
    // More than the two ends: a two-point answer would be the straight line in disguise.
    expect(path!.length).toBeGreaterThan(20)
    // And no wild detour: rail is never twice the crow-flies distance.
    const km = path!.slice(1).reduce((sum, p, i) => sum + distanceKm(path![i]!, p), 0)
    expect(km).toBeLessThan(distanceKm(PARIS, city) * 2)
  })
})
