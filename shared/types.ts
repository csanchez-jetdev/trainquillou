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
  slug?: string // city slug for booking URLs (see server/utils/booking.ts)
}

/**
 * Search direction around a "hub":
 * - `from`      : departures FROM the hub towards destinations (default)
 * - `to`        : arrivals AT the hub from possible origins (reverse search)
 * - `range`     : departures from the hub over a date range (multi-day exploration)
 * - `roundtrip` : destinations whose outbound AND return legs are both bookable
 */
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

export interface RouteResult {
  from: { label: string; coords: [number, number] | null }
  to: { label: string; coords: [number, number] | null }
  date: string // YYYY-MM-DD
  maxStops: number
  itineraries: Itinerary[] // sorted by increasing duration
  alsoAvailable: string[] // following days (YYYY-MM-DD) with a trip in ≤1 connection
}
