import type { PublicLandFeature } from '../types'

const BLM_QUERY_URL =
  'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Limited_Areas/MapServer/0/query'

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Centroid of the bounding box of a ring of coordinates ([lng,lat] pairs)
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
    // Use the largest polygon (most coordinates)
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

export async function getPublicLandPolygons(
  lat: number,
  lng: number,
  radiusMiles: number
): Promise<{ polygons: LandPolygon[]; geoJsonFeatures: PublicLandFeature[] }> {
  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: 'esriGeometryPoint',
    inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects',
    distance: Math.min(radiusMiles, 60).toString(),  // cap at 60mi to keep response size reasonable
    units: 'esriSRUnit_StatuteMile',
    where: "ADMIN_AGCY IN ('BLM', 'FS')",
    outFields: 'ADMIN_AGCY,GIS_ACRES,LABEL_NAME,OBJECTID',
    returnGeometry: 'true',
    f: 'geojson',
    outSR: '4326',
    resultRecordCount: '25',
  })

  const res = await fetch(`${BLM_QUERY_URL}?${params}`, {
    headers: { 'User-Agent': 'ColoradoCampingFinder/1.0' },
    signal: AbortSignal.timeout(20000),
  })

  if (!res.ok) {
    throw new Error(`BLM ArcGIS API returned ${res.status}`)
  }

  const data = await res.json()

  if (data.error) {
    throw new Error(`ArcGIS error: ${JSON.stringify(data.error)}`)
  }

  const features = (data.features ?? []) as Array<{
    geometry: { type: string; coordinates: unknown }
    properties: Record<string, unknown>
  }>

  const polygons: LandPolygon[] = features
    .filter((f) => f.geometry && f.properties)
    .map((f): LandPolygon | null => {
      const props = f.properties
      const centroid = geometryCentroid(f.geometry)
      if (!centroid[0] || !centroid[1]) return null

      const rawAgency = String(props.ADMIN_AGCY ?? '')
      const agency: 'BLM' | 'USFS' | 'unknown' =
        rawAgency === 'BLM' ? 'BLM' : rawAgency === 'FS' ? 'USFS' : 'unknown'

      return {
        id: String(props.OBJECTID ?? `${centroid[0]}-${centroid[1]}`),
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
    .sort((a, b) => a.distanceMiles - b.distanceMiles)

  const geoJsonFeatures: PublicLandFeature[] = polygons.map((p) => ({
    type: 'Feature',
    geometry: p.geometry,
    properties: {
      landType: p.adminAgency === 'USFS' ? 'USFS' : 'BLM',
      name: p.name,
    },
  }))

  return { polygons, geoJsonFeatures }
}
