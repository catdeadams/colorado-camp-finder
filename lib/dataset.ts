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
  // RIDB returns many non-campground "Facility" points for activity=camping
  // (ranger districts, scenic byways, trailheads, boat launches, towns, etc.).
  // Keep only actual campgrounds so the blue "first-come" label isn't applied to
  // things you can't camp at. Reservable records are kept regardless of type.
  const recgov = data.campgrounds.filter(isCampgroundRecord).map(toCampground)
  // Some CO state parks are also listed in rec.gov (often as first-come). They
  // reserve via cpwshop, so drop the rec.gov duplicate and keep the CPW entry.
  const norm = (s: string) => s.toLowerCase().replace(/\b(state park|recreation area|campground|sp|cg)\b/g, '').replace(/[^a-z0-9]/g, '')
  const cpwByKey = new Map(cpw.map((c) => [norm(c.name), c] as const))
  const recDeduped = recgov.filter((r) => {
    const match = cpwByKey.get(norm(r.name))
    return !(match && haversineMi(r.lat, r.lng, match.lat, match.lng) < 6)
  })
  cache = [...recDeduped, ...cpw]
  return cache
}

function haversineMi(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
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

const CG_NAME = /campground|\bcg\b/i
/** RIDB lists non-campground facilities under activity=camping; keep real campgrounds only. */
function isCampgroundRecord(r: RawCampground): boolean {
  return r.reservable || r.type === 'Campground' || CG_NAME.test(r.name)
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
