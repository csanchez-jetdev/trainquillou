export interface Train {
  departure: string // "14:58"
  arrival: string // "17:48"
  trainNumber: string | null
}

export interface Destination {
  label: string
  coords: [number, number] | null // [lat, lon]
  trains: Train[]
  availableDates?: string[] // mode=range : jours où la destination est joignable
  returnTrains?: Train[] // mode=roundtrip : trains du retour, à la date de retour
  popularity?: number // notoriété touristique : nb d'éditions Wikipédia de la ville (proxy)
  slug?: string // slug de ville pour les URL de réservation (voir server/utils/booking.ts)
}

/**
 * Sens de recherche autour d'un « hub » :
 * - `from`      : départs DEPUIS le hub vers des destinations (défaut)
 * - `to`        : arrivées VERS le hub depuis des origines possibles (recherche inverse)
 * - `range`     : départs depuis le hub sur une plage de dates (exploration multi-jours)
 * - `roundtrip` : destinations dont l'aller ET le retour sont réservables (escapade)
 */
export type SearchMode = 'from' | 'to' | 'range' | 'roundtrip'

export interface SearchResult {
  origin: {
    label: string
    coords: [number, number] | null
    slug?: string
  } // le hub (départ ou arrivée selon le mode)
  date: string // YYYY-MM-DD (date de début en mode range, date d'aller en mode roundtrip)
  dateTo?: string // YYYY-MM-DD : fin de plage en mode range, date de retour en mode roundtrip
  mode: SearchMode
  destinations: Destination[] // les gares reliées (destinations, ou origines en mode `to`)
}

export interface ReturnDatesResult {
  origin: string
  destination: string
  dates: string[] // YYYY-MM-DD, triées croissantes
}

// --- Mode itinéraire multi-sauts (A → B via gares intermédiaires) ---

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
  stops: number // nombre de gares intermédiaires (legs.length - 1)
  departure: string // heure de départ du 1er leg
  arrival: string // heure d'arrivée du dernier leg
  durationMin: number // durée totale porte-à-porte en minutes
}

export interface RouteResult {
  from: { label: string; coords: [number, number] | null }
  to: { label: string; coords: [number, number] | null }
  date: string // YYYY-MM-DD
  maxStops: number
  itineraries: Itinerary[] // triées par durée croissante
  alsoAvailable: string[] // jours suivants (YYYY-MM-DD) où un trajet ≤1 corresp. existe
}
