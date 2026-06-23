export type DateMode = 'exact' | 'flexible'
export type AmenityFilter = 'waterfront' | 'restrooms' | 'drinkingWater' | 'hookups' | 'pets' | 'nearTown'

export interface SearchParams {
  query: string
  startDate: string   // exact mode check-in / flexible mode ignored
  endDate: string     // exact mode check-out / flexible mode ignored
  dateMode: DateMode
  windowStart?: string  // flexible: start of window (YYYY-MM-DD)
  windowEnd?: string    // flexible: end of window (YYYY-MM-DD)
  tripNights?: number   // flexible: minimum consecutive nights desired
  radiusMiles: number
  vehicleType: 'car' | 'awd' | '4wd'
  enabledSources: SourceKey[]
  amenities: AmenityFilter[]
  gpsLat?: number   // if set, skip geocoding
  gpsLng?: number
}

export interface SourceCounts {
  recgov: number
  cpw: number
  freecampsites: number
  thedyrt: number
  ioverlander: number
  [key: string]: number
}

export type AvailabilityStatus = 'available' | 'limited' | 'full' | 'unknown'

export type CampgroundSource = 'recgov' | 'cpw' | 'hipcamp' | 'freecampsites' | 'thedyrt' | 'ioverlander'

export type SourceKey = 'recgov' | 'cpw' | 'freecampsites' | 'thedyrt' | 'ioverlander'

export const ALL_SOURCES: SourceKey[] = ['recgov', 'cpw', 'freecampsites', 'thedyrt', 'ioverlander']

export const SOURCE_META: Record<SourceKey, { label: string; description: string; reserveType: string }> = {
  recgov:        { label: 'Recreation.gov',       description: 'Federal campgrounds (USFS, NPS, BLM)',  reserveType: 'reservable' },
  cpw:           { label: 'Colorado State Parks',  description: 'CO state park campgrounds',             reserveType: 'reservable' },
  freecampsites: { label: 'FreeCampsites.net',     description: 'Community free & dispersed sites',     reserveType: 'first-come' },
  thedyrt:       { label: 'The Dyrt',              description: 'Crowdsourced campground database',     reserveType: 'mixed' },
  ioverlander:   { label: 'iOverlander',           description: 'Overland & dispersed camping spots',   reserveType: 'dispersed' },
}

export type ReserveType = 'reservable' | 'first-come' | 'dispersed' | 'unknown'

export interface Campground {
  id: string
  name: string
  description: string
  lat: number
  lng: number
  source: CampgroundSource
  reserveType: ReserveType
  distance: number  // miles from search center
  availability: AvailabilityStatus
  availableSites: number
  totalSites: number
  reserveUrl: string
  directionsUrl: string
  phone?: string
  amenities: string[]
  campgroundType?: string
  minVehicle?: 'car' | 'awd' | '4wd'  // minimum vehicle needed
}

export interface GeocodedLocation {
  lat: number
  lng: number
  displayName: string
}

export interface SearchResponse {
  campgrounds: Campground[]
  total: number
  center: GeocodedLocation
}

// ── Dispersed camping ─────────────────────────────────────────────────────────

export type FlatnessRating = 'flat' | 'gentle' | 'moderate' | 'hilly' | 'steep' | 'unknown'
export type RoadAccessType = 'paved' | 'gravel' | '4wd' | 'walk-in' | 'unknown'

export interface DispersedSpot {
  id: string
  name: string
  landType: 'BLM' | 'USFS' | 'unknown'
  lat: number
  lng: number
  distance: number       // miles from search center
  acreage: number
  elevationFt: number
  slopeAngle: number     // degrees — lower is flatter
  flatnessRating: FlatnessRating
  estimatedFlatSpots: number
  roadAccess: RoadAccessType
  nearestRoadMiles: number
  directionsUrl: string
}

export interface PublicLandFeature {
  type: 'Feature'
  geometry: { type: string; coordinates: unknown }
  properties: { landType: 'BLM' | 'USFS'; name: string }
}
