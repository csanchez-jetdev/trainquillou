export interface Train {
  departure: string // "14:58"
  arrival: string // "17:48"
  trainNumber: string | null
}

export interface Destination {
  label: string
  coords: [number, number] | null // [lat, lon]
  trains: Train[]
}

export interface SearchResult {
  origin: { label: string; coords: [number, number] | null }
  date: string // YYYY-MM-DD
  destinations: Destination[]
}

export interface ReturnDatesResult {
  origin: string
  destination: string
  dates: string[] // YYYY-MM-DD, triées croissantes
}
