import type { FeatureCollection } from 'geojson'
import type { Campground } from './types'

// Shape of records in /public/data/co-campgrounds.json (produced by scripts/build-co-pack.mjs)
export interface RawCampground {
  id: string
  name: string
  lat: number
  lng: number
  reservable: boolean
  type: string
  phone?: string
  reserveUrl: string
  recAreaId?: string
  activities: string[]
  photo?: string
  siteCount?: number
}

let cache: Campground[] | null = null

/** Load the bundled Colorado campground dataset: rec.gov + CO State Parks (instant, offline-capable). */
export async function loadCampgrounds(): Promise<Campground[]> {
  if (cache) return cache
  const [recRes, cpw] = await Promise.all([fetch('/data/co-campgrounds.json'), loadCpwParks()])
  if (!recRes.ok) throw new Error('Failed to load campground dataset')
  const data = (await recRes.json()) as { campgrounds: RawCampground[] }
  cache = [...data.campgrounds.map(toCampground), ...cpw]
  return cache
}

interface RawCpwPark { name: string; lat: number; lng: number; reserveUrl: string; slugValid: boolean }

async function loadCpwParks(): Promise<Campground[]> {
  try {
    const res = await fetch('/data/co-cpw-parks.json')
    if (!res.ok) return []
    const data = (await res.json()) as { parks: RawCpwPark[] }
    return data.parks.map(toCpwCampground)
  } catch {
    return []
  }
}

function toCpwCampground(p: RawCpwPark): Campground {
  return {
    id: `cpw-${p.lat.toFixed(4)}-${p.lng.toFixed(4)}`,
    name: p.name,
    description: 'Colorado State Park',
    lat: p.lat,
    lng: p.lng,
    source: 'cpw',
    reserveType: 'reservable', // reservable, but live availability isn't checked yet
    distance: 0,
    availability: 'unknown',
    availableSites: 0,
    totalSites: 0,
    reserveUrl: p.reserveUrl,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`,
    amenities: [],
    campgroundType: 'Colorado State Park',
  }
}

function toCampground(r: RawCampground): Campground {
  return {
    id: r.id,
    name: r.name,
    description: r.type || '',
    lat: r.lat,
    lng: r.lng,
    source: 'recgov',
    // RIDB Reservable=false → not bookable on rec.gov (first-come or info-only).
    // Per-site reserve type refines this during the availability check.
    reserveType: r.reservable ? 'reservable' : 'first-come',
    distance: 0,
    availability: 'unknown',
    availableSites: 0,
    totalSites: r.siteCount ?? 0,
    reserveUrl: r.reserveUrl,
    directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`,
    phone: r.phone,
    amenities: r.activities ?? [],
    campgroundType: r.type,
    photo: r.photo,
    recAreaId: r.recAreaId,
  }
}

let plCache: FeatureCollection | null = null
let mvumCache: FeatureCollection | null = null

/** Public-land polygons (BLM/USFS/NPS/State/…), agency in properties.agency. */
export async function loadPublicLand(): Promise<FeatureCollection> {
  if (plCache) return plCache
  const res = await fetch('/data/co-public-land.geojson')
  if (!res.ok) throw new Error('Failed to load public land')
  plCache = await res.json()
  return plCache!
}

/** MVUM forest roads; properties.car/hc/fourwd = 'open' when that vehicle class is allowed. */
export async function loadMVUM(): Promise<FeatureCollection> {
  if (mvumCache) return mvumCache
  const res = await fetch('/data/co-mvum-roads.geojson')
  if (!res.ok) throw new Error('Failed to load MVUM roads')
  mvumCache = await res.json()
  return mvumCache!
}
