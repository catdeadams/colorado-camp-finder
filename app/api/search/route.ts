import { NextResponse } from 'next/server'
import { searchCampgrounds, getCampgroundAvailability } from '@/lib/recgov'
import { searchFreeCampsites } from '@/lib/sources/freecampsites'
import { searchColoradoStateParks } from '@/lib/sources/reserveamerica'
import { searchTheDyrt } from '@/lib/sources/thedyrt'
import { searchIOverlander } from '@/lib/sources/ioverlander'
import { deduplicateCampgrounds } from '@/lib/dedup'
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

  if (!lat || !lng || !startDate || !endDate) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
  }

  const start = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  const counts: Record<string, number> = { recgov: 0, cpw: 0, freecampsites: 0, thedyrt: 0, ioverlander: 0 }

  try {
    // Run all non-recgov sources in parallel (no availability batch needed)
    const [cpwResult, freeResult, dyrtResult, iOverResult] = await Promise.allSettled([
      enabledSources.has('cpw')
        ? searchColoradoStateParks(lat, lng, radius, start, end)
        : Promise.resolve([]),
      enabledSources.has('freecampsites')
        ? searchFreeCampsites(lat, lng, radius)
        : Promise.resolve([]),
      enabledSources.has('thedyrt')
        ? searchTheDyrt(lat, lng, radius)
        : Promise.resolve([]),
      enabledSources.has('ioverlander')
        ? searchIOverlander(lat, lng, radius)
        : Promise.resolve([]),
    ])

    const cpwCampgrounds = cpwResult.status === 'fulfilled' ? cpwResult.value : []
    const freeCampgrounds = freeResult.status === 'fulfilled' ? freeResult.value : []
    const dyrtCampgrounds = dyrtResult.status === 'fulfilled' ? dyrtResult.value : []
    const iOverCampgrounds = iOverResult.status === 'fulfilled' ? iOverResult.value : []

    counts.cpw = cpwCampgrounds.length
    counts.freecampsites = freeCampgrounds.length
    counts.thedyrt = dyrtCampgrounds.length
    counts.ioverlander = iOverCampgrounds.length

    // rec.gov: fetch list then check availability in batches
    const recgovCampgrounds: Campground[] = []
    if (enabledSources.has('recgov')) {
      const facilities = await searchCampgrounds(lat, lng, radius)

      for (let i = 0; i < facilities.length; i += 10) {
        const batch = facilities.slice(i, i + 10)
        const results = await Promise.allSettled(
          batch.map(async (facility) => {
            const avail = await getCampgroundAvailability(facility.FacilityID, start, end)
            const c: Campground = {
              id: facility.FacilityID,
              name: facility.FacilityName,
              description: (facility.FacilityDescription || '').replace(/<[^>]*>/g, '').slice(0, 250),
              lat: facility.FacilityLatitude,
              lng: facility.FacilityLongitude,
              source: 'recgov',
              reserveType: 'reservable',
              distance: haversineDistance(lat, lng, facility.FacilityLatitude, facility.FacilityLongitude),
              availability: avail.status,
              availableSites: avail.availableSites,
              totalSites: avail.totalSites,
              reserveUrl: `https://www.recreation.gov/camping/campgrounds/${facility.FacilityID}`,
              directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${facility.FacilityLatitude},${facility.FacilityLongitude}`,
              phone: facility.FacilityPhone || undefined,
              amenities: (facility.ACTIVITY || []).map((a) => a.ActivityName).slice(0, 5),
              campgroundType: facility.FacilityTypeDescription,
            }
            return c
          })
        )
        for (const r of results) {
          if (r.status === 'fulfilled') recgovCampgrounds.push(r.value)
        }
      }
      counts.recgov = recgovCampgrounds.length
    }

    // Deduplicate and sort
    const all = deduplicateCampgrounds([
      ...recgovCampgrounds,
      ...cpwCampgrounds,
      ...dyrtCampgrounds,
      ...freeCampgrounds,
      ...iOverCampgrounds,
    ])

    all.sort((a, b) => {
      const sd = AVAILABILITY_ORDER[a.availability] - AVAILABILITY_ORDER[b.availability]
      return sd !== 0 ? sd : a.distance - b.distance
    })

    return NextResponse.json({ campgrounds: all, total: all.length, sources: counts })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    )
  }
}
