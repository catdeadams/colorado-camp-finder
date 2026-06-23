import type { RoadAccessType } from '../types'

const OVERPASS_HOSTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function classifyRoad(highway: string, tracktype?: string): RoadAccessType {
  if (['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'unclassified'].includes(highway)) {
    return 'paved'
  }
  if (highway === 'track') {
    // grade1/grade2 = well-maintained gravel; grade3+ = rough / 4WD
    return !tracktype || tracktype === 'grade1' || tracktype === 'grade2' ? 'gravel' : '4wd'
  }
  if (['path', 'footway', 'bridleway', 'cycleway'].includes(highway)) return 'walk-in'
  return 'unknown'
}

export async function getNearestRoadAccess(lat: number, lng: number): Promise<{
  access: RoadAccessType
  distanceMiles: number
  highwayTag: string
}> {
  // Search within ~1.5 miles (2400m)
  const query = `[out:json][timeout:5];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|track|service)$"](around:2400,${lat},${lng});
out tags center;`

  for (const host of OVERPASS_HOSTS) {
    try {
      const res = await fetch(host, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(6000),
      })
      if (!res.ok) continue

      const data = await res.json()
      const elements: Array<{
        center?: { lat: number; lon: number }
        tags?: { highway?: string; tracktype?: string }
      }> = data.elements ?? []

      if (elements.length === 0) {
        return { access: 'walk-in', distanceMiles: 99, highwayTag: 'none' }
      }

      let nearest = { dist: Infinity, highway: 'unknown', tracktype: undefined as string | undefined }

      for (const el of elements) {
        if (!el.center) continue
        const d = haversineDistance(lat, lng, el.center.lat, el.center.lon)
        if (d < nearest.dist) {
          nearest = { dist: d, highway: el.tags?.highway ?? 'unknown', tracktype: el.tags?.tracktype }
        }
      }

      return {
        access: classifyRoad(nearest.highway, nearest.tracktype),
        distanceMiles: Math.round(nearest.dist * 10) / 10,
        highwayTag: nearest.highway,
      }
    } catch {
      continue
    }
  }

  return { access: 'unknown', distanceMiles: 0, highwayTag: 'unknown' }
}
