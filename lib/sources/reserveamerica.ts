import type { Campground, AvailabilityStatus } from '../types'

const CO_CONTRACT = 'CO'

// Try these hosts in order; some proxies/networks block one but not another
const HOSTS = [
  'https://coloradostateparks.reserveamerica.com',
  'https://www.reserveamerica.com',
]

interface RAPark {
  contractCode?: string
  parkId: string | number
  parkName: string
  latitude: number
  longitude: number
  sitesAvailable?: number
  availableCount?: number
  totalSites?: number
  siteCount?: number
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

function formatDate(date: Date): string {
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  const y = date.getUTCFullYear()
  return `${m}/${d}/${y}`
}

function nightsBetween(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000))
}

function parseParkList(data: Record<string, unknown>): RAPark[] {
  const candidates = [
    data.campsiteList,
    data.parkList,
    data.results,
    data.data,
    data.campsites,
  ]
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c as RAPark[]
  }
  return []
}

export async function searchColoradoStateParks(
  lat: number,
  lng: number,
  radiusMiles: number,
  startDate: Date,
  endDate: Date
): Promise<Campground[]> {
  const params = new URLSearchParams({
    contractCode: CO_CONTRACT,
    lat: lat.toString(),
    lng: lng.toString(),
    radius: radiusMiles.toString(),
    startDate: formatDate(startDate),
    nights: nightsBetween(startDate, endDate).toString(),
    maxRecordCount: '50',
  })

  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'application/json, text/plain, */*',
    Referer: 'https://coloradostateparks.reserveamerica.com/',
    'X-Requested-With': 'XMLHttpRequest',
  }

  for (const host of HOSTS) {
    try {
      const res = await fetch(`${host}/jaxrs-json/camp/nearbyAvailability?${params}`, {
        headers,
        signal: AbortSignal.timeout(12000),
      })

      if (!res.ok) continue

      const data = await res.json() as Record<string, unknown>
      const parks = parseParkList(data)
      if (parks.length === 0) continue

      return parks
        .filter((p) => !p.contractCode || p.contractCode === CO_CONTRACT)
        .filter((p) => p.latitude && p.longitude)
        .map((park): Campground => {
          const available = Number(park.sitesAvailable ?? park.availableCount ?? 0)
          const total = Number(park.totalSites ?? park.siteCount ?? 0)

          let availability: AvailabilityStatus
          if (total === 0) availability = 'unknown'
          else if (available === 0) availability = 'full'
          else if (available <= Math.ceil(total * 0.2)) availability = 'limited'
          else availability = 'available'

          const parkId = String(park.parkId)

          return {
            id: `cpw-${parkId}`,
            name: park.parkName,
            description: 'Colorado State Park',
            lat: park.latitude,
            lng: park.longitude,
            source: 'cpw',
            reserveType: 'reservable',
            distance: haversineDistance(lat, lng, park.latitude, park.longitude),
            availability,
            availableSites: available,
            totalSites: total,
            reserveUrl: `https://coloradostateparks.reserveamerica.com/campsiteSearch.do?contractCode=CO&parkId=${parkId}`,
            directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${park.latitude},${park.longitude}`,
            amenities: [],
            campgroundType: 'Colorado State Park',
          }
        })
    } catch (err) {
      console.warn(`CPW search failed on ${host}:`, err instanceof Error ? err.message : err)
    }
  }

  return []
}
