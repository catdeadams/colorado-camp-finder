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
    sw_lat: lat - latDelta,
    sw_lng: lng - lngDelta,
    ne_lat: lat + latDelta,
    ne_lng: lng + lngDelta,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractCampgrounds(data: any, searchLat: number, searchLng: number, radiusMiles: number): Campground[] {
  const items = data?.data ?? data?.campgrounds ?? data?.results ?? []
  if (!Array.isArray(items)) return []

  return items
    .map((item: Record<string, unknown>): Campground | null => {
      const attrs = (item.attributes as Record<string, unknown>) ?? item
      const lat = Number(attrs.latitude ?? attrs.lat ?? 0)
      const lng = Number(attrs.longitude ?? attrs.lng ?? 0)
      if (!lat || !lng) return null

      const distance = haversineDistance(searchLat, searchLng, lat, lng)
      if (distance > radiusMiles) return null

      const id = String(item.id ?? attrs.id ?? `dyrt-${lat}-${lng}`)
      const slug = String(attrs.slug ?? attrs.url_slug ?? id)
      const name = String(attrs.name ?? 'Unnamed Campground')
      const rating = Number(attrs.rating ?? attrs.average_rating ?? 0)
      const reviewCount = Number(attrs.reviews_count ?? attrs.review_count ?? 0)

      const descParts: string[] = []
      if (rating > 0) descParts.push(`⭐ ${rating.toFixed(1)}`)
      if (reviewCount > 0) descParts.push(`${reviewCount} reviews`)
      const stateCode = String(attrs.state_code ?? attrs.state ?? '')
      if (stateCode) descParts.push(stateCode)

      const reserveUrl = `https://thedyrt.com/camping/${slug}`

      return {
        id: `thedyrt-${id}`,
        name,
        description: descParts.join(' · '),
        lat,
        lng,
        source: 'thedyrt',
        reserveType: 'unknown',
        distance,
        availability: 'unknown',
        availableSites: 0,
        totalSites: Number(attrs.campsite_count ?? attrs.site_count ?? 0),
        reserveUrl,
        directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
        amenities: [],
        campgroundType: String(attrs.campground_type ?? attrs.type_label ?? ''),
      }
    })
    .filter((c): c is Campground => c !== null)
    .slice(0, 40)
}

export async function searchTheDyrt(
  lat: number,
  lng: number,
  radiusMiles: number
): Promise<Campground[]> {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'application/json',
    Referer: 'https://thedyrt.com/',
  }

  // Try radius-based search first
  try {
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      radius: radiusMiles.toString(),
      limit: '50',
      order_by: 'distance',
    })
    const res = await fetch(`https://thedyrt.com/api/v5/campgrounds/search?${params}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      const results = extractCampgrounds(data, lat, lng, radiusMiles)
      if (results.length > 0) return results
    }
  } catch {
    // Fall through to bounding-box attempt
  }

  // Fallback: bounding box search
  try {
    const bb = boundingBox(lat, lng, radiusMiles)
    const params = new URLSearchParams({
      'bounding_box[ne_lat]': bb.ne_lat.toString(),
      'bounding_box[ne_lng]': bb.ne_lng.toString(),
      'bounding_box[sw_lat]': bb.sw_lat.toString(),
      'bounding_box[sw_lng]': bb.sw_lng.toString(),
      limit: '50',
    })
    const res = await fetch(`https://thedyrt.com/api/v5/campgrounds/search?${params}`, {
      headers,
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) {
      const data = await res.json()
      return extractCampgrounds(data, lat, lng, radiusMiles)
    }
  } catch {
    // Silent fail
  }

  console.warn('The Dyrt search returned no results (API may have changed)')
  return []
}
