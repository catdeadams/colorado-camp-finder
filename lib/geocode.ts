import type { GeocodedLocation } from './types'

export async function geocodeLocation(query: string): Promise<GeocodedLocation | null> {
  const withState = query.toLowerCase().includes('colorado') || query.toLowerCase().includes(', co')
    ? query
    : `${query}, Colorado`

  const params = new URLSearchParams({
    q: withState,
    format: 'json',
    limit: '1',
    countrycodes: 'us',
  })

  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
    headers: {
      'User-Agent': 'ColoradoCampingFinder/1.0 (catadamsm@gmail.com)',
    },
  })

  if (!res.ok) return null

  const data = await res.json()
  if (!data.length) return null

  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    displayName: data[0].display_name,
  }
}
