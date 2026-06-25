import type { StyleSpecification } from 'maplibre-gl'
import { layers, namedFlavor } from '@protomaps/basemaps'

// Colorado bounds [west, south, east, north]
export const CO_BOUNDS: [number, number, number, number] = [-109.06, 36.99, -102.04, 41.0]
export const CO_CENTER: [number, number] = [-105.55, 39.0]

// Online topo basemap: USGS The National Map (US-gov, no API key, contours +
// shaded relief baked in — ideal "topo/outdoors" look). The offline pack will
// swap in a self-hosted PMTiles vector basemap (see Phase 4 / Task #3).
export const TOPO_STYLE: StyleSpecification = {
  version: 8,
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    'usgs-topo': {
      type: 'raster',
      tiles: ['https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      maxzoom: 16,
      attribution: 'USGS The National Map',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#e8e3d8' } },
    { id: 'topo', type: 'raster', source: 'usgs-topo' },
  ],
}

// Offline-capable topo basemap: Protomaps vector tiles (from the bundled CO
// PMTiles) + hillshade/dispersed layers added in MapView. Glyphs/sprites are
// Protomaps-hosted for now (self-hosted in the offline pack later).
const PM_ASSETS = 'https://protomaps.github.io/basemaps-assets'

export function buildTopoStyle(pmtilesSourceUrl: string): StyleSpecification {
  return {
    version: 8,
    glyphs: `${PM_ASSETS}/fonts/{fontstack}/{range}.pbf`,
    sprite: `${PM_ASSETS}/sprites/v4/light`,
    sources: {
      protomaps: { type: 'vector', url: pmtilesSourceUrl, attribution: '© OpenStreetMap · Protomaps' },
    },
    layers: layers('protomaps', namedFlavor('light'), { lang: 'en' }) as StyleSpecification['layers'],
  }
}

// Pin colors. `first-come` (blue) is intentionally distinct from availability.
export const STATUS_COLORS: Record<string, string> = {
  available: '#22c55e',
  limited: '#f59e0b',
  full: '#ef4444',
  'first-come': '#3b82f6',
  unknown: '#9ca3af',
}
