import { NextResponse } from 'next/server'
import { getPublicLandPolygons } from '@/lib/sources/publicland'
import { analyzeTerrainAtPoint } from '@/lib/terrain'
import { getNearestRoadAccess } from '@/lib/sources/roadaccess'
import type { DispersedSpot, FlatnessRating, RoadAccessType } from '@/lib/types'

// Allow up to 55s on Vercel (hobby plan cap is 60s)
export const maxDuration = 55

function estimateFlatSpots(acreage: number, slope: number): number {
  // Rough heuristic: ~1 decent spot per N acres depending on steepness
  if (slope < 3)  return Math.min(20, Math.max(1, Math.floor(acreage / 15)))
  if (slope < 5)  return Math.min(12, Math.max(1, Math.floor(acreage / 30)))
  if (slope < 8)  return Math.min(6,  Math.max(1, Math.floor(acreage / 60)))
  if (slope < 13) return Math.min(3,  Math.max(1, Math.floor(acreage / 200)))
  return 1
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat') || '')
  const lng = parseFloat(searchParams.get('lng') || '')
  const radius = parseInt(searchParams.get('radius') || '50')
  const vehicleType = searchParams.get('vehicleType') || 'awd'

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing lat/lng' }, { status: 400 })
  }

  try {
    const { polygons, geoJsonFeatures } = await getPublicLandPolygons(lat, lng, radius)

    if (polygons.length === 0) {
      return NextResponse.json({ spots: [], polygons: [], total: 0, message: 'No public land found in this area' })
    }

    // Analyze terrain + road access for up to 8 spots in parallel.
    // Fewer = faster; each target makes ~6 external API calls.
    const targets = polygons.slice(0, 8)

    const analyzed = await Promise.allSettled(
      targets.map(async (land) => {
        const [terrainResult, roadResult] = await Promise.allSettled([
          analyzeTerrainAtPoint(land.centroidLat, land.centroidLng),
          getNearestRoadAccess(land.centroidLat, land.centroidLng),
        ])

        const terrain = terrainResult.status === 'fulfilled'
          ? terrainResult.value
          : { elevationFt: 0, slopeAngle: 0, flatnessRating: 'unknown' as FlatnessRating }

        const road = roadResult.status === 'fulfilled'
          ? roadResult.value
          : { access: 'unknown' as RoadAccessType, distanceMiles: 0, highwayTag: '' }

        const spot: DispersedSpot = {
          id: `dispersed-${land.id}`,
          name: land.name,
          landType: land.adminAgency,
          lat: land.centroidLat,
          lng: land.centroidLng,
          distance: Math.round(land.distanceMiles * 10) / 10,
          acreage: Math.round(land.acreage),
          elevationFt: terrain.elevationFt,
          slopeAngle: terrain.slopeAngle,
          flatnessRating: terrain.flatnessRating,
          estimatedFlatSpots: estimateFlatSpots(land.acreage, terrain.slopeAngle),
          roadAccess: road.access,
          nearestRoadMiles: road.distanceMiles,
          directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${land.centroidLat},${land.centroidLng}`,
        }

        return spot
      })
    )

    // Vehicle filter: car=paved only, awd=paved+gravel, 4wd=all
    function isAccessible(access: RoadAccessType): boolean {
      if (access === 'unknown') return true  // include unknowns regardless
      if (vehicleType === 'car') return access === 'paved'
      if (vehicleType === 'awd') return access === 'paved' || access === 'gravel'
      return true  // 4wd can handle everything
    }

    const spots: DispersedSpot[] = analyzed
      .filter((r): r is PromiseFulfilledResult<DispersedSpot> => r.status === 'fulfilled')
      .map((r) => r.value)
      .filter((s) => isAccessible(s.roadAccess))
      .sort((a, b) => {
        const order: Record<string, number> = { flat: 0, gentle: 1, moderate: 2, hilly: 3, steep: 4, unknown: 5 }
        const fd = (order[a.flatnessRating] ?? 5) - (order[b.flatnessRating] ?? 5)
        return fd !== 0 ? fd : a.distance - b.distance
      })

    return NextResponse.json({ spots, polygons: geoJsonFeatures, total: spots.length })
  } catch (err) {
    console.error('Dispersed search error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load dispersed camping data' },
      { status: 500 }
    )
  }
}
