/** `[lon, lat]`, GeoJSON order — not the `[lat, lon]` the API uses for stations. */
export type Point = [number, number]

/** Written as type aliases and not interfaces, so MapLibre accepts them as GeoJSON. */
export type RailSegment = {
  type: 'Feature'
  properties: { v: number }
  geometry: { type: 'LineString', coordinates: number[][] }
}

export type RailCollection = { type: 'FeatureCollection', features: RailSegment[] }

export interface RailGraph {
  nodes: Point[]
  /** Node index → `[neighbour, cost in hours]`. */
  edges: Map<number, Array<[number, number]>>
}

/** Grid identical vertices are welded on, in degrees — about 80 m. */
const SNAP = 0.001

/** Two lines meeting at a junction share no vertex in the source geometry. */
const LINK_KM = 0.8
/** Cell the neighbour search runs on, wide enough that nine cells cover `LINK_KM`. */
const LINK_CELL = 0.01
/** Speed charged to a link, in km/h: low enough that real track stays preferred. */
const LINK_SPEED = 10

/** Beyond this, the station has no track near it — foreign stations, mostly. */
const MAX_SNAP_KM = 25

const EARTH_KM = 6371

export function distanceKm(a: Point, b: Point): number {
  const lat = (((a[1] + b[1]) / 2) * Math.PI) / 180
  const dx = (b[0] - a[0]) * Math.cos(lat)
  const dy = b[1] - a[1]
  return Math.hypot(dx, dy) * (Math.PI / 180) * EARTH_KM
}

export function buildRailGraph(segments: RailSegment[]): RailGraph {
  const index = new Map<string, number>()
  const nodes: Point[] = []
  const edges = new Map<number, Array<[number, number]>>()

  function nodeAt(point: Point): number {
    const key = `${Math.round(point[0] / SNAP)},${Math.round(point[1] / SNAP)}`
    const known = index.get(key)
    if (known !== undefined) return known
    index.set(key, nodes.length)
    nodes.push(point)
    return nodes.length - 1
  }

  function link(from: number, to: number, cost: number) {
    const list = edges.get(from)
    if (list) list.push([to, cost])
    else edges.set(from, [[to, cost]])
  }

  for (const segment of segments) {
    const speed = Math.max(segment.properties.v, 30)
    let previous: { node: number, point: Point } | null = null
    for (const [lon, lat] of segment.geometry.coordinates) {
      if (lon === undefined || lat === undefined) continue
      const point: Point = [lon, lat]
      const node = nodeAt(point)
      if (previous && previous.node !== node) {
        const cost = distanceKm(previous.point, point) / speed
        link(previous.node, node, cost)
        link(node, previous.node, cost)
      }
      previous = { node, point }
    }
  }

  linkNeighbours(nodes, link)
  return { nodes, edges }
}

function linkNeighbours(nodes: Point[], link: (from: number, to: number, cost: number) => void) {
  const cells = new Map<string, number[]>()
  const cellKey = (point: Point) =>
    `${Math.floor(point[0] / LINK_CELL)},${Math.floor(point[1] / LINK_CELL)}`

  for (const [i, point] of nodes.entries()) {
    const key = cellKey(point)
    const cell = cells.get(key)
    if (cell) cell.push(i)
    else cells.set(key, [i])
  }

  for (const [i, point] of nodes.entries()) {
    const col = Math.floor(point[0] / LINK_CELL)
    const row = Math.floor(point[1] / LINK_CELL)
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        for (const j of cells.get(`${col + dc},${row + dr}`) ?? []) {
          if (j <= i) continue
          const other = nodes[j]
          if (!other) continue
          const km = distanceKm(point, other)
          if (km > LINK_KM) continue
          const cost = km / LINK_SPEED
          link(i, j, cost)
          link(j, i, cost)
        }
      }
    }
  }
}

function nearestNode(graph: RailGraph, target: Point): number {
  let best = -1
  let bestKm = MAX_SNAP_KM
  for (const [i, node] of graph.nodes.entries()) {
    const km = distanceKm(node, target)
    if (km < bestKm) {
      bestKm = km
      best = i
    }
  }
  return best
}

export interface RailTree {
  source: number
  /** Node index → the node it is best reached from, `-1` when unreachable. */
  previous: Int32Array
}

/** `null` when no track lies near the station — foreign ones, mostly. */
export function railTree(graph: RailGraph, from: Point): RailTree | null {
  const source = nearestNode(graph, from)
  if (source < 0) return null

  const count = graph.nodes.length
  const dist = new Float64Array(count).fill(Infinity)
  const previous = new Int32Array(count).fill(-1)
  const open = new Set<number>([source])
  dist[source] = 0

  while (open.size) {
    let node = -1
    let best = Infinity
    for (const candidate of open) {
      // `?? Infinity` for the type only: every index here is in range by construction.
      const total = dist[candidate] ?? Infinity
      if (total < best) {
        best = total
        node = candidate
      }
    }
    if (node < 0) break
    open.delete(node)
    for (const [next, cost] of graph.edges.get(node) ?? []) {
      const total = best + cost
      if (total < (dist[next] ?? Infinity)) {
        dist[next] = total
        previous[next] = node
        open.add(next)
      }
    }
  }

  return { source, previous }
}

/** `null` when the network does not connect the two ends. */
export function treePath(graph: RailGraph, tree: RailTree, to: Point): Point[] | null {
  const target = nearestNode(graph, to)
  if (target < 0 || target === tree.source) return null

  const path: Point[] = []
  for (let node = target; node >= 0; node = tree.previous[node] ?? -1) {
    const point = graph.nodes[node]
    if (!point) break
    path.push(point)
    if (node === tree.source) break
  }
  // A path that never reached the source is a dead end of the walk, not a route.
  return path.length > 1 && path.at(-1) === graph.nodes[tree.source] ? path.reverse() : null
}

/** Rebuilds the tree on every call: many destinations should share one `railTree`. */
export function railPath(graph: RailGraph, from: Point, to: Point): Point[] | null {
  const tree = railTree(graph, from)
  return tree ? treePath(graph, tree, to) : null
}

/** A leg the network cannot route falls back to its straight line. */
export function railPathThrough(graph: RailGraph, stops: Point[]): Point[] {
  const path: Point[] = []
  for (const [i, stop] of stops.entries()) {
    const next = stops[i + 1]
    if (!next) break
    const leg = railPath(graph, stop, next) ?? [stop, next]
    // The junction between two legs is a single station, drawn once.
    path.push(...(i === 0 ? leg : leg.slice(1)))
  }
  return path
}
