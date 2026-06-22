import type { FlatnessRating } from './types'

// ~75 metres in degrees at Colorado latitudes (~38-41°N)
const DELTA_LAT = 0.00067
const DELTA_LNG = 0.00090

const USGS_URLS = [
  'https://epqs.nationalmap.gov/v1/json',
  'https://nationalmap.gov/epqs/pqs.php',  // legacy fallback
]

async function fetchElevation(lat: number, lng: number): Promise<number | null> {
  for (const base of USGS_URLS) {
    try {
      const isLegacy = base.includes('pqs.php')
      const url = isLegacy
        ? `${base}?x=${lng}&y=${lat}&units=Feet&output=json`
        : `${base}?x=${lng}&y=${lat}&units=Feet&includeDate=false`

      const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
      if (!res.ok) continue

      const data = await res.json()

      // Handle multiple response shapes
      const raw = isLegacy
        ? data?.USGS_Elevation_Point_Query_Service?.Elevation_Query?.Elevation
        : data?.value

      const val = parseFloat(String(raw ?? ''))
      if (!isNaN(val) && val > -1000) return val
    } catch {
      // Try next URL
    }
  }
  return null
}

export async function analyzeTerrainAtPoint(lat: number, lng: number): Promise<{
  elevationFt: number
  slopeAngle: number
  flatnessRating: FlatnessRating
}> {
  const points: [number, number][] = [
    [lat, lng],
    [lat + DELTA_LAT, lng],
    [lat - DELTA_LAT, lng],
    [lat, lng + DELTA_LNG],
    [lat, lng - DELTA_LNG],
  ]

  const elevations = await Promise.all(points.map(([la, lo]) => fetchElevation(la, lo)))

  const center = elevations[0]
  if (center === null) {
    return { elevationFt: 0, slopeAngle: 0, flatnessRating: 'unknown' }
  }

  const cardinal = elevations.slice(1).filter((e): e is number => e !== null)
  if (cardinal.length === 0) {
    return { elevationFt: Math.round(center), slopeAngle: 0, flatnessRating: 'unknown' }
  }

  // Distance between sampled points ≈ 246 ft (75m)
  const DIST_FT = 246
  const maxDiff = Math.max(...cardinal.map((e) => Math.abs(e - center)))
  const slopeAngle = Math.atan(maxDiff / DIST_FT) * (180 / Math.PI)
  const slopeRounded = Math.round(slopeAngle * 10) / 10

  let flatnessRating: FlatnessRating
  if (slopeRounded < 3)  flatnessRating = 'flat'
  else if (slopeRounded < 5)  flatnessRating = 'gentle'
  else if (slopeRounded < 8)  flatnessRating = 'moderate'
  else if (slopeRounded < 13) flatnessRating = 'hilly'
  else flatnessRating = 'steep'

  return { elevationFt: Math.round(center), slopeAngle: slopeRounded, flatnessRating }
}
