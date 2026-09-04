export interface Train {
  departure: string // "14:58"
  arrival: string // "17:48"
  trainNumber: string | null
}

export interface Destination {
  label: string
  coords: [number, number] | null // [lat, lon]
  trains: Train[]
  availableDates?: string[] // mode=range: days the destination can be reached on
  returnTrains?: Train[] // mode=roundtrip: return trains, on the return date
  popularity?: number // tourist notoriety: number of Wikipedia editions for the city (proxy)
  slug?: string // city slug for booking URLs
}

/** Direction around the hub: departures, arrivals (reverse), date range, round trip. */
export type SearchMode = 'from' | 'to' | 'range' | 'roundtrip'

export interface SearchResult {
  origin: {
    label: string
    coords: [number, number] | null
    slug?: string
  } // the hub (departure or arrival, depending on the mode)
  date: string // YYYY-MM-DD (range start in range mode, outbound date in roundtrip mode)
  dateTo?: string // YYYY-MM-DD: range end in range mode, return date in roundtrip mode
  mode: SearchMode
  destinations: Destination[] // connected stations (destinations, or origins in `to` mode)
}

export interface ReturnDatesResult {
  origin: string
  destination: string
  dates: string[] // YYYY-MM-DD, ascending
}

// --- Multi-hop itinerary mode (A → B via intermediate stations) ---

export interface RouteLeg {
  from: string
  to: string
  fromCoords: [number, number] | null
  toCoords: [number, number] | null
  departure: string // "HH:MM"
  arrival: string // "HH:MM"
  trainNumber: string | null
}

export interface Itinerary {
  legs: RouteLeg[]
  stops: number // number of intermediate stations (legs.length - 1)
  departure: string // departure time of the first leg
  arrival: string // arrival time of the last leg
  durationMin: number // total door-to-door duration, in minutes
}

// --- Multi-stop planner (A → B → C, loops, day trips) ---

export interface MultilegLeg {
  from: string
  to: string
  days: string[] // YYYY-MM-DD the hop is bookable on, ascending
  options: number // bookable trains for this hop over the whole window
}

export interface MultilegHop {
  from: string
  to: string
  date: string // YYYY-MM-DD
  departure: string // "HH:MM"
  arrival: string // "HH:MM"
  trainNumber: string | null
}

export interface MultilegResult {
  stops: { label: string; coords: [number, number] | null }[]
  window: { from: string; to: string } // the window actually explored, clamped to the data
  minStayHours: number
  directOnly: boolean // hops with no direct train are reported, never expanded
  legs: MultilegLeg[]
  itinerary: MultilegHop[] | null // the chain arriving soonest, null when a hop blocks
  blockedAt: number | null // index of the first impossible hop
}

/** A station on the network map. `coords` is `[lat, lon]`, as everywhere else in this API. */
export interface NetworkStation {
  label: string
  coords: [number, number]
  offers: number
  soldOut: number // departures seen sold out since the first recorded ingestion, 0 until one is
}

export interface NetworkLink {
  from: string
  to: string
  fromCoords: [number, number]
  toCoords: [number, number]
  offers: number // both directions summed: one line on a map
}

export interface CoverageAxis {
  label: string
  total: number
  eligible: number
  stations: [number, number][] // where the axis leaves from, as the dataset reports it
}

/** Share of the published offer that is TGVmax-eligible, counted in dataset rows. */
export interface Coverage {
  observedOn: string
  total: number
  eligible: number
  axes: CoverageAxis[] // sorted by decreasing share
  excluded: { label: string; total: number }[] // axes with no eligible seat at all
  daily: { date: string; total: number; eligible: number }[]
}

export interface StatsResult {
  origin: string | null // the station every count is narrowed to, null for all of France
  updatedOn: string // YYYY-MM-DD of the last ingestion, not of the request
  window: { first: string; last: string } // days the stored offers cover
  offers: number // bookable legs, the unit every other count is derived from
  routes: number // station pairs linked, both directions counted once
  stations: { served: number; known: number } // with a bookable leg, out of those the dataset names
  daily: { date: string; offers: number }[] // one entry per day of the window, ordered
  hourly: { hour: number; offers: number }[] // by departure hour
  // `days` is how many of that weekday the window holds, so only the average compares
  weekdays: { weekday: number; offers: number; days: number }[] // 1 = Monday
  // The two crossed; a cell with nothing in it is absent, not zero
  weeklyGrid: { weekday: number; hour: number; offers: number; days: number }[]
  durations: { band: string; max: number; offers: number }[] // `max` in minutes, 0 = unbounded
  topOrigins: { label: string; offers: number; destinations: number }[]
  topDestinations: { label: string; offers: number; origins: number }[]
  network: { stations: NetworkStation[]; links: NetworkLink[]; linkCount: number }
  coverage: Coverage | null // null while the aggregate is missing or stale, and always when scoped
  history: History
}

/** What comparing one daily reading to the next has shown so far. */
export interface History {
  since: string // first offer ever stored, which predates the ledger on an older instance
  soldOut: number
  reopened: number
  runs: Ingestion[] // one per day observed, oldest first
  leadTimes: { days: number; soldOut: number }[] // days between the flip and the departure
}

export interface Ingestion {
  date: string
  observed: number // bookable legs the export listed that day, the denominator of the others
  created: number
  reappeared: number
  vanished: number
}

export interface RouteResult {
  from: { label: string; coords: [number, number] | null }
  to: { label: string; coords: [number, number] | null }
  date: string // YYYY-MM-DD
  maxStops: number
  itineraries: Itinerary[] // sorted by increasing duration
  alsoAvailable: string[] // next days (YYYY-MM-DD) of the window with a trip in ≤1 connection
}
