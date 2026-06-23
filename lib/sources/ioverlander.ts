import type { Campground } from '../types'

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function boundingBox(lat: number, lng: number, radiusMiles: number) {
  const latDelta = radiusMiles / 69.0
  const lngDelta = radiusMiles / (69.0 * Math.cos((lat * Math.PI) / 180))
  return {
    sw_lat: (lat - latDelta).toFixed(6),
    sw_lng: (lng - lngDelta).toFixed(6),
    ne_lat: (lat + latDelta).toFixed(6),
    ne_lng: (lng + lngDelta).toFixed(6),
  }
}

// iOverlander place type IDs that are camping-related
// (excludes gas, mechanic, border crossing, etc.)
const CAMPING_TYPES = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 19, 20, 21, 22])

interface IOPlace {
  id: number
  name: string
  latitude: number | string
  longitude: number | string
  description?: string
  place_type_id?: number
  place_type?: string
  rating?: number
  reviews_count?: number
}

export async function searchIOverlander(
  lat: number,
  lng: number,
  radiusMiles: number
): Promise<Campground[]> {
  try {
    const bb = boundingBox(lat, lng, radiusMiles)
    const params = new URLSearchParams({
      ne_lat: bb.ne_lat,
      ne_lng: bb.ne_lng,
      sw_lat: bb.sw_lat,
      sw_lng: bb.sw_lng,
      zoom: '10',
    })

    const res = await fetch(`https://ioverlander.com/places.json?${params}`, {
      headers: {
        'User-Agent': 'ColoradoCampingFinder/1.0 (catadamsm@gmail.com)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return []

    const places: IOPlace[] = await res.json()
    if (!Array.isArray(places)) return []

    return places
      .filter((p) => {
        if (p.place_type_id && !CAMPING_TYPES.has(p.place_type_id)) return false
        return true
      })
      .map((place): Campground | null => {
        const placeLat = parseFloat(String(place.latitude))
        const placeLng = parseFloat(String(place.longitude))
        if (isNaN(placeLat) || isNaN(placeLng)) return null

        const distance = haversineDistance(lat, lng, placeLat, placeLng)
        if (distance > radiusMiles) return null

        const ratingStr = place.rating ? `${Number(place.rating).toFixed(1)} stars` : ''
        const reviewStr = place.reviews_count ? `${place.reviews_count} reviews` : ''
        const desc = [place.description?.slice(0, 120), ratingStr, reviewStr]
          .filter(Boolean)
          .join(' · ')

        return {
          id: `ioverlander-${place.id}`,
          name: place.name || 'Unnamed Spot',
          description: desc,
          lat: placeLat,
          lng: placeLng,
          source: 'ioverlander',
          reserveType: 'dispersed',
          distance,
          availability: 'unknown',
          availableSites: 0,
          totalSites: 0,
          reserveUrl: `https://ioverlander.com/places/${place.id}`,
          directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${placeLat},${placeLng}`,
          amenities: [],
          campgroundType: place.place_type || 'Overland / Dispersed',
        }
      })
      .filter((c): c is Campground => c !== null)
      .slice(0, 30)
  } catch (err) {
    console.warn('iOverlander search failed:', err instanceof Error ? err.message : err)
    return []
  }
}
