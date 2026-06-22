import type { Campground } from '../types'

const BASE = 'https://freecampsites.net/api/1/'

interface FreeSite {
  siteid?: string
  id?: string
  sitename?: string
  name?: string
  latitude: string | number
  longitude: string | number
  description?: string
  directions?: string
  camptype?: string
  type?: string
}

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function searchFreeCampsites(
  lat: number,
  lng: number,
  radiusMiles: number
): Promise<Campground[]> {
  try {
    const params = new URLSearchParams({
      request: 'search',
      latitude: lat.toString(),
      longitude: lng.toString(),
      type: 'public',
    })

    const res = await fetch(`${BASE}?${params}`, {
      headers: { 'User-Agent': 'ColoradoCampingFinder/1.0 (catadamsm@gmail.com)' },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) return []

    const raw = await res.json()
    const sites: FreeSite[] = Array.isArray(raw) ? raw : raw.data || raw.results || []

    return sites
      .map((site): Campground | null => {
        const siteLat = parseFloat(String(site.latitude))
        const siteLng = parseFloat(String(site.longitude))
        if (isNaN(siteLat) || isNaN(siteLng)) return null

        const distance = haversineDistance(lat, lng, siteLat, siteLng)
        if (distance > radiusMiles) return null

        const id = String(site.siteid || site.id || `fcs-${siteLat}-${siteLng}`)
        const name = site.sitename || site.name || 'Unnamed Site'

        return {
          id: `freecampsites-${id}`,
          name,
          description: (site.description || site.directions || '').slice(0, 250),
          lat: siteLat,
          lng: siteLng,
          source: 'freecampsites',
          reserveType: 'first-come',
          distance,
          availability: 'unknown',
          availableSites: 0,
          totalSites: 0,
          reserveUrl: `https://freecampsites.net/#!id=${id}`,
          directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${siteLat},${siteLng}`,
          amenities: [],
          campgroundType: 'Free / Dispersed',
        }
      })
      .filter((c): c is Campground => c !== null)
      .slice(0, 30)
  } catch (err) {
    console.warn('FreeCampsites.net search failed:', err instanceof Error ? err.message : err)
    return []
  }
}
