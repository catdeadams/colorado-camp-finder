import type { PublicLandFeature } from '../types'

// BLM has migrated some services — try FeatureServer first, fall back to MapServer
const BLM_URLS = [
  'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Limited_Areas/FeatureServer/0/query',
  'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Limited_Areas/MapServer/0/query',
]

// USFS National Forest System Lands — try both subdomains for reliability
const USFS_URLS = [
  'https://apps.fs.usda.gov/arcgis/rest/services/EDW/EDW_ForestSystemLands_01/MapServer/0/query',
  'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_ForestSystemLands_01/MapServer/0/query',
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

function ringBBCentroid(coords: number[][]): [number, number] {
  let minLat = Infinity, maxLat = -Infinity
  let minLng = Infinity, maxLng = -Infinity
  for (const [lng, lat] of coords) {
    if (lat < minLat) minLat = lat
    if (lat > maxLat) maxLat = lat
    if (lng < minLng) minLng = lng
    if (lng > maxLng) maxLng = lng
  }
  return [(minLat + maxLat) / 2, (minLng + maxLng) / 2]
}

function geometryCentroid(geometry: { type: string; coordinates: unknown }): [number, number] {
  if (geometry.type === 'Polygon') {
    const ring = (geometry.coordinates as number[][][])[0]
    return ringBBCentroid(ring)
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates as number[][][][]
    const largest = polys.reduce((a, b) => (a[0].length >= b[0].length ? a : b))
    return ringBBCentroid(largest[0])
  }
  return [0, 0]
}

export interface LandPolygon {
  id: string
  name: string
  adminAgency: 'BLM' | 'USFS' | 'unknown'
  acreage: number
  centroidLat: number
  centroidLng: number
  distanceMiles: number
  geometry: { type: string; coordinates: unknown }
}

function buildArcGISParams(lng: number, lat: number, radiusMiles: number, outFields: string): URLSearchParams {
  return new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    distance: Math.min(radiusMiles, 60).toString(),
    units: 'esriSRUnit_StatuteMile',
    outFields,
    returnGeometry: 'true',
    f: 'geojson',
    outSR: '4326',
    resultRecordCount: '20',
  })
}

async function fetchBLM(lat: number, lng: number, radiusMiles: number): Promise<LandPolygon[]> {
  const params = buildArcGISParams(lng, lat, radiusMiles, 'ADMIN_AGCY,GIS_ACRES,LABEL_NAME,OBJECTID')
  params.set('where', "ADMIN_AGCY IN ('BLM', 'FS')")

  for (const url of BLM_URLS) {
    try {
      const res = await fetch(`${url}?${params}`, {
        headers: { 'User-Agent': 'ColoradoCampingFinder/1.0' },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) continue
      const data = await res.json()
      if (data.error) continue

      const features = (data.features ?? []) as Array<{
        geometry: { type: string; coordinates: unknown }
        properties: Record<string, unknown>
      }>

      const results = features
        .filter((f) => f.geometry && f.properties)
        .map((f): LandPolygon | null => {
          const props = f.properties
          const centroid = geometryCentroid(f.geometry)
          if (!centroid[0] || !centroid[1]) return null
          const rawAgency = String(props.ADMIN_AGCY ?? '')
          const agency: 'BLM' | 'USFS' | 'unknown' =
            rawAgency === 'BLM' ? 'BLM' : rawAgency === 'FS' ? 'USFS' : 'unknown'
          return {
            id: String(props.OBJECTID ?? `blm-${centroid[0]}-${centroid[1]}`),
            name: String(props.LABEL_NAME ?? `${agency} Land`),
            adminAgency: agency,
            acreage: Number(props.GIS_ACRES ?? 0),
            centroidLat: centroid[0],
            centroidLng: centroid[1],
            distanceMiles: haversineDistance(lat, lng, centroid[0], centroid[1]),
            geometry: f.geometry,
          }
        })
        .filter((p): p is LandPolygon => p !== null && p.acreage >= 40)

      if (results.length > 0) return results
    } catch {
      continue
    }
  }
  return []
}

async function fetchUSFS(lat: number, lng: number, radiusMiles: number): Promise<LandPolygon[]> {
  const params = buildArcGISParams(lng, lat, radiusMiles, 'FORESTNAME,GIS_ACRES,OBJECTID')
  params.set('where', '1=1')

  for (const url of USFS_URLS) {
    try {
      const res = await fetch(`${url}?${params}`, {
        headers: { 'User-Agent': 'ColoradoCampingFinder/1.0' },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) continue
      const data = await res.json()
      if (data.error) continue

      const features = (data.features ?? []) as Array<{
        geometry: { type: string; coordinates: unknown }
        properties: Record<string, unknown>
      }>

      const results = features
        .filter((f) => f.geometry && f.properties)
        .map((f): LandPolygon | null => {
          const props = f.properties
          const centroid = geometryCentroid(f.geometry)
          if (!centroid[0] || !centroid[1]) return null
          const acres = Number(props.GIS_ACRES ?? props.GIS_ACRES1 ?? props.AREAHECTARES ?? 0)
          return {
            id: `usfs-${String(props.OBJECTID ?? `${centroid[0]}-${centroid[1]}`)}`,
            name: String(props.FORESTNAME ?? 'National Forest'),
            adminAgency: 'USFS',
            acreage: acres,
            centroidLat: centroid[0],
            centroidLng: centroid[1],
            distanceMiles: haversineDistance(lat, lng, centroid[0], centroid[1]),
            geometry: f.geometry,
          }
        })
        .filter((p): p is LandPolygon => p !== null && p.acreage >= 40)

      if (results.length > 0) return results
    } catch {
      continue
    }
  }
  return []
}

export async function getPublicLandPolygons(
  lat: number,
  lng: number,
  radiusMiles: number
): Promise<{ polygons: LandPolygon[]; geoJsonFeatures: PublicLandFeature[] }> {
  const [blmPolygons, usfsPolygons] = await Promise.all([
    fetchBLM(lat, lng, radiusMiles),
    fetchUSFS(lat, lng, radiusMiles),
  ])

  // Deduplicate: BLM query sometimes also tags FS lands; USFS query fills the gap
  const blmIds = new Set(blmPolygons.map((p) => p.id))
  const merged = [
    ...blmPolygons,
    ...usfsPolygons.filter((p) => !blmIds.has(p.id)),
  ]
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, 25)

  if (merged.length === 0) {
    return { polygons: [], geoJsonFeatures: [] }
  }

  const geoJsonFeatures: PublicLandFeature[] = merged.map((p) => ({
    type: 'Feature',
    geometry: p.geometry,
    properties: {
      landType: p.adminAgency === 'USFS' ? 'USFS' : 'BLM',
      name: p.name,
    },
  }))

  return { polygons: merged, geoJsonFeatures }
}
