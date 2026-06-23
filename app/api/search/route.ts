import { NextResponse } from 'next/server'

export const maxDuration = 55
import { searchCampgrounds } from '@/lib/recgov'
import { searchFreeCampsites } from '@/lib/sources/freecampsites'
import { searchColoradoStateParks } from '@/lib/sources/reserveamerica'
import { searchTheDyrt } from '@/lib/sources/thedyrt'
import { searchIOverlander } from '@/lib/sources/ioverlander'
import { deduplicateCampgrounds } from '@/lib/dedup'
import { CO_TOWNS } from '@/lib/towns'
import type { Campground, SourceKey } from '@/lib/types'

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function matchesAmenities(c: Campground, amenities: string[]): boolean {
  if (amenities.length === 0) return true
  const text = [
    ...c.amenities.map((a) => a.toLowerCase()),
    c.name.toLowerCase(),
    c.description.toLowerCase(),
  ].join(' ')

  return amenities.every((f) => {
    if (f === 'waterfront')   return /\b(fish|swim|boat|lake|river|creek|reservoir|pond|water|aquatic)\b/.test(text)
    if (f === 'restrooms')    return /\b(toilet|restroom|bathroom|latrine|outhouse|vault|flush)\b/.test(text)
    if (f === 'drinkingWater') return /\b(potable|drinking water|water station|water available)\b/.test(text)
    if (f === 'hookups')      return /\b(hookup|electric|30.?amp|50.?amp|rv.?trailer|full.?hook)\b/.test(text)
    if (f === 'pets')         return /\b(pet|dog|animal|leash)\b/.test(text)
    if (f === 'nearTown')     return CO_TOWNS.some(
      (t) => haversineDistance(c.lat, c.lng, t.lat, t.lng) <= 20
    )
    return true
  })
}

const AVAILABILITY_ORDER = { available: 0, limited: 1, unknown: 2, full: 3 }

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get('lat') || '')
  const lng = parseFloat(searchParams.get('lng') || '')
  const radius = parseInt(searchParams.get('radius') || '50')
  const startDate = searchParams.get('startDate') || ''
  const endDate = searchParams.get('endDate') || ''
  const sourcesParam = searchParams.get('sources') || 'recgov,cpw,freecampsites,thedyrt,ioverlander'
  const enabledSources = new Set<SourceKey>(sourcesParam.split(',') as SourceKey[])
  const vehicleType = (searchParams.get('vehicleType') || 'awd') as 'car' | 'awd' | '4wd'
  const amenitiesParam = searchParams.get('amenities') || ''
  const amenities = amenitiesParam ? amenitiesParam.split(',') : []
  const dateMode = searchParams.get('dateMode') || 'exact'
  const windowStart = searchParams.get('windowStart') || startDate
  const windowEnd = searchParams.get('windowEnd') || endDate

  // For flexible mode, use the window bounds; for exact mode, use the specific dates
  const effectiveStart = dateMode === 'flexible' ? windowStart : startDate
  const effectiveEnd = dateMode === 'flexible' ? windowEnd : endDate

  if (!lat || !lng || !effectiveStart || !effectiveEnd) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
  }

  const start = new Date(`${effectiveStart}T00:00:00Z`)
  const end = new Date(`${effectiveEnd}T00:00:00Z`)

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  const counts: Record<string, number> = { recgov: 0, cpw: 0, freecampsites: 0, thedyrt: 0, ioverlander: 0 }

  try {
    const [cpwResult, freeResult, dyrtResult, iOverResult] = await Promise.allSettled([
      enabledSources.has('cpw')          ? searchColoradoStateParks(lat, lng, radius, start, end) : Promise.resolve([]),
      enabledSources.has('freecampsites') ? searchFreeCampsites(lat, lng, radius)                 : Promise.resolve([]),
      enabledSources.has('thedyrt')       ? searchTheDyrt(lat, lng, radius)                       : Promise.resolve([]),
      enabledSources.has('ioverlander')   ? searchIOverlander(lat, lng, radius)                   : Promise.resolve([]),
    ])

    const cpwCampgrounds  = cpwResult.status  === 'fulfilled' ? cpwResult.value  : []
    const freeCampgrounds = freeResult.status === 'fulfilled' ? freeResult.value : []
    const dyrtCampgrounds = dyrtResult.status === 'fulfilled' ? dyrtResult.value : []
    const iOverCampgrounds = iOverResult.status === 'fulfilled' ? iOverResult.value : []

    counts.cpw          = cpwCampgrounds.length
    counts.freecampsites = freeCampgrounds.length
    counts.thedyrt      = dyrtCampgrounds.length
    counts.ioverlander  = iOverCampgrounds.length

    const recgovCampgrounds: Campground[] = []
    if (enabledSources.has('recgov')) {
      // Availability is NOT checked here — the browser does it client-side after
      // this response arrives (rec.gov's availability API blocks server-side calls).
      const facilities = await searchCampgrounds(lat, lng, radius)
      for (const facility of facilities.slice(0, 50)) {
        recgovCampgrounds.push({
          id: facility.FacilityID,
          name: facility.FacilityName,
          description: (facility.FacilityDescription || '').replace(/<[^>]*>/g, '').slice(0, 250),
          lat: facility.FacilityLatitude,
          lng: facility.FacilityLongitude,
          source: 'recgov',
          reserveType: 'reservable',
          distance: haversineDistance(lat, lng, facility.FacilityLatitude, facility.FacilityLongitude),
          availability: 'unknown',
          availableSites: 0,
          totalSites: 0,
          reserveUrl: facility.FacilityReservationURL || `https://www.recreation.gov/camping/campgrounds/${facility.FacilityID}`,
          directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${facility.FacilityLatitude},${facility.FacilityLongitude}`,
          phone: facility.FacilityPhone || undefined,
          amenities: (facility.ACTIVITY || []).map((a: { ActivityName: string }) => a.ActivityName).slice(0, 8),
          campgroundType: facility.FacilityTypeDescription,
        })
      }
      counts.recgov = recgovCampgrounds.length
    }

    const all = deduplicateCampgrounds([
      ...recgovCampgrounds,
      ...cpwCampgrounds,
      ...dyrtCampgrounds,
      ...freeCampgrounds,
      ...iOverCampgrounds,
    ])

    // Apply vehicle filter (only meaningful when minVehicle is set on the campground)
    const VEHICLE_RANK: Record<string, number> = { car: 0, awd: 1, '4wd': 2 }
    const vehicleRank = VEHICLE_RANK[vehicleType] ?? 1

    const vehicleFiltered = all.filter((c) => {
      if (!c.minVehicle) return true
      return (VEHICLE_RANK[c.minVehicle] ?? 0) <= vehicleRank
    })

    // Apply amenity filter
    const amenityFiltered = matchesAmenities
      ? vehicleFiltered.filter((c) => matchesAmenities(c, amenities))
      : vehicleFiltered

    amenityFiltered.sort((a, b) => {
      const sd = (AVAILABILITY_ORDER[a.availability] ?? 2) - (AVAILABILITY_ORDER[b.availability] ?? 2)
      return sd !== 0 ? sd : a.distance - b.distance
    })

    return NextResponse.json({
      campgrounds: amenityFiltered,
      total: amenityFiltered.length,
      sources: counts,
      dateMode,
      windowStart: effectiveStart,
      windowEnd: effectiveEnd,
    })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    )
  }
}
