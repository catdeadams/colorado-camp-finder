'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import mlcontour from 'maplibre-contour'
import type { FeatureCollection } from 'geojson'
import { buildTopoStyle, getBasemapUrl, CO_CENTER } from '@/lib/basemap'
import { loadPublicLand, loadMVUM } from '@/lib/dataset'
import type { Campground, PinStatus } from '@/lib/types'
import type { SavedSite } from '@/lib/store'

let pmtilesRegistered = false
let demSource: InstanceType<typeof mlcontour.DemSource> | null = null
function ensureDemSource() {
  if (demSource) return demSource
  demSource = new mlcontour.DemSource({
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    encoding: 'terrarium', maxzoom: 13, worker: true,
  })
  demSource.setupMaplibre(maplibregl)
  return demSource
}

export interface MapBounds { west: number; south: number; east: number; north: number; zoom: number }

interface Props {
  campgrounds: Campground[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  center?: { lat: number; lng: number } | null
  savedSites?: SavedSite[]
  showSaved?: boolean
  onBoundsChange?: (b: MapBounds) => void
  dropMode?: boolean
  onMapPoint?: (lat: number, lng: number) => void
  showPublicLand?: boolean
  showRoads?: boolean
  showHillshade?: boolean
  basemap?: 'terrain' | 'streets'
}

function statusOf(c: Campground): PinStatus {
  if (c.reserveType === 'first-come') return 'first-come'
  return (c.availability as PinStatus) ?? 'unknown'
}

function campsFC(campgrounds: Campground[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: campgrounds
      .filter((c) => c.lat && c.lng)
      .map((c) => ({
        type: 'Feature',
        id: c.id,
        geometry: { type: 'Point', coordinates: [c.lng, c.lat] },
        properties: { id: c.id, status: statusOf(c), src: c.source },
      })),
  }
}

function savedFC(sites: SavedSite[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: sites
      .filter((s) => s.lat && s.lng)
      .map((s) => ({
        type: 'Feature',
        id: s.id,
        geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
        properties: { id: s.id, kind: s.kind },
      })),
  }
}

const FLAT_COLOR: Record<string, string> = { flat: '#16a34a', gentle: '#84cc16', moderate: '#f59e0b', steep: '#dc2626' }
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

export default function MapView({
  campgrounds, selectedId, onSelect, center, savedSites = [], showSaved = true, onBoundsChange,
  dropMode = false, onMapPoint,
  showPublicLand = false, showRoads = false, showHillshade = false, basemap = 'terrain',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const onSelectRef = useRef(onSelect)
  const onBoundsRef = useRef(onBoundsChange)
  const prevSelected = useRef<string | null>(null)
  const onMapPointRef = useRef(onMapPoint)
  const dropModeRef = useRef(dropMode)
  const dataLoadedRef = useRef({ publicLand: false, roads: false })
  const [mapReady, setMapReady] = useState(false)
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { onBoundsRef.current = onBoundsChange }, [onBoundsChange])
  useEffect(() => { onMapPointRef.current = onMapPoint }, [onMapPoint])
  useEffect(() => { dropModeRef.current = dropMode }, [dropMode])

  // ── init map ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!pmtilesRegistered) { maplibregl.addProtocol('pmtiles', new Protocol().tile); pmtilesRegistered = true }
    ensureDemSource()
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildTopoStyle(`pmtiles://${getBasemapUrl()}`),
      center: CO_CENTER,
      zoom: 6.4,
      maxZoom: 16,
      attributionControl: { compact: true },
      preserveDrawingBuffer: true,
    })
    mapRef.current = map
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined') (window as unknown as { __campmap?: maplibregl.Map }).__campmap = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true }, trackUserLocation: true,
    }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left')

    const emitBounds = () => {
      const b = map.getBounds()
      onBoundsRef.current?.({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth(), zoom: map.getZoom() })
    }

    map.on('load', () => {
      map.addSource('camps', { type: 'geojson', data: campsFC(campgrounds), promoteId: 'id' })
      map.addLayer({
        id: 'camp-circles', type: 'circle', source: 'camps',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            5, ['case', ['boolean', ['feature-state', 'selected'], false], 7, 4],
            10, ['case', ['boolean', ['feature-state', 'selected'], false], 11, 6.5],
            14, ['case', ['boolean', ['feature-state', 'selected'], false], 15, 9]],
          'circle-color': ['case', ['==', ['get', 'src'], 'cpw'], '#8b5cf6',
            ['match', ['get', 'status'],
              'available', '#22c55e', 'limited', '#f59e0b', 'full', '#ef4444', 'first-come', '#3b82f6', '#9ca3af']],
          'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.5],
          'circle-stroke-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#ffffff', '#0c0a09'],
          'circle-opacity': 0.95,
        },
      })

      map.addSource('saved', { type: 'geojson', data: savedFC(savedSites), promoteId: 'id' })
      map.addLayer({
        id: 'saved-circles', type: 'circle', source: 'saved',
        layout: { visibility: showSaved ? 'visible' : 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 6, 10, 9, 14, 12],
          'circle-color': ['match', ['get', 'kind'], 'dispersed', '#ea580c', '#d97706'],
          'circle-stroke-width': 2.5,
          'circle-stroke-color': ['match', ['get', 'kind'], 'dispersed', '#fed7aa', '#fde68a'],
          'circle-opacity': 0.9,
        },
      })

      const labelLayerId = map.getStyle().layers.find((l) => l.type === 'symbol')?.id

      // ── orientation aids: the plain "light" style draws no state outline and
      // very thin highways, so zoomed-out (and offline) views are hard to place.
      // Re-draw both from the Protomaps vector data already in the offline pack. ──
      map.addLayer({
        id: 'orient-highways', type: 'line', source: 'protomaps', 'source-layer': 'roads',
        filter: ['==', ['get', 'kind'], 'highway'], maxzoom: 11,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#b45309',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1, 8, 2.4, 11, 3.5],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.85, 9, 0.85, 10.5, 0.5, 11, 0],
        },
      }, labelLayerId)
      map.addLayer({
        id: 'orient-state-borders', type: 'line', source: 'protomaps', 'source-layer': 'boundaries',
        filter: ['==', ['get', 'kind'], 'region'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#44403c',
          'line-dasharray': [2, 1.5],
          'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.3, 8, 2.4, 12, 3.2],
          'line-opacity': 0.9,
        },
      }, labelLayerId)

      // ── dispersed-intel layers (below pins/labels; hidden until toggled) ──
      map.addSource('dem', {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium', tileSize: 256, maxzoom: 13,
      })
      map.addLayer({
        id: 'hillshade', type: 'hillshade', source: 'dem', minzoom: 7, layout: { visibility: 'none' },
        paint: { 'hillshade-exaggeration': 0.45, 'hillshade-shadow-color': '#3a2f1d', 'hillshade-highlight-color': '#fff8e7' },
      }, labelLayerId)
      map.addSource('publicland', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'publicland-fill', type: 'fill', source: 'publicland', minzoom: 8, layout: { visibility: 'none' },
        paint: {
          'fill-color': ['match', ['get', 'agency'],
            'BLM', '#ca8a04', 'USFS', '#15803d', 'USFS_LU', '#15803d', 'USFS_NG', '#15803d',
            'NPS', '#7e22ce', 'STA', '#0284c7', 'BOR', '#0d9488', 'USFW', '#be185d', '#6b7280'],
          'fill-opacity': 0.2,
        },
      }, labelLayerId)
      map.addLayer({
        id: 'publicland-outline', type: 'line', source: 'publicland', minzoom: 8, layout: { visibility: 'none' },
        paint: {
          'line-color': ['match', ['get', 'agency'],
            'BLM', '#ca8a04', 'USFS', '#15803d', 'USFS_LU', '#15803d', 'USFS_NG', '#15803d',
            'NPS', '#7e22ce', 'STA', '#0284c7', 'BOR', '#0d9488', 'USFW', '#be185d', '#6b7280'],
          'line-opacity': 0.45, 'line-width': 0.6,
        },
      }, labelLayerId)
      map.addSource('mvum', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      // Dark casing beneath the colored roads so they stay legible on any basemap.
      map.addLayer({
        id: 'mvum-casing', type: 'line', source: 'mvum', minzoom: 8, layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#0c0a09',
          'line-opacity': 0.55,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 2.6, 11, 5, 14, 8],
        },
      }, labelLayerId)
      map.addLayer({
        id: 'mvum-roads', type: 'line', source: 'mvum', minzoom: 8, layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['match', ['get', 'flat'],
            'flat', '#16a34a', 'gentle', '#84cc16', 'moderate', '#f59e0b', 'steep', '#dc2626', '#9ca3af'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.4, 11, 3, 14, 5],
          'line-opacity': 0.95,
        },
      }, labelLayerId)

      // ── contour lines (topo) generated from the terrain DEM, below labels ──
      map.addSource('contour-src', {
        type: 'vector',
        tiles: [demSource!.contourProtocolUrl({
          thresholds: { 10: [500, 2500], 11: [200, 1000], 12: [100, 500], 13: [50, 250], 14: [50, 250], 15: [25, 100] },
          contourLayer: 'contours', elevationKey: 'ele', levelKey: 'level',
        })],
        maxzoom: 15,
      })
      map.addLayer({
        id: 'contour-lines', type: 'line', source: 'contour-src', 'source-layer': 'contours', minzoom: 10,
        paint: {
          'line-color': '#9c6b3f',
          'line-width': ['match', ['get', 'level'], 1, 1.1, 0.5],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 10, 0.15, 12, 0.4],
        },
      }, labelLayerId)

      map.on('click', 'camp-circles', (e) => {
        const f = e.features?.[0]
        if (f) onSelectRef.current(String(f.properties?.id))
      })
      map.on('mouseenter', 'camp-circles', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'camp-circles', () => { map.getCanvas().style.cursor = '' })
      map.on('click', (e) => {
        if (map.queryRenderedFeatures(e.point, { layers: ['camp-circles'] }).length) return
        if (dropModeRef.current) { onMapPointRef.current?.(e.lngLat.lat, e.lngLat.lng); return }
        onSelectRef.current(null)
      })
      map.on('click', 'mvum-roads', (e) => {
        const p = (e.features?.[0]?.properties || {}) as Record<string, unknown>
        const name = p.name ? titleCase(String(p.name)) : 'Unnamed forest road'
        const access = p.car === 'open' ? { label: 'Cars OK', color: '#22c55e' }
          : p.hc === 'open' ? { label: 'High-clearance', color: '#f59e0b' }
          : p.fourwd === 'open' ? { label: '4WD only', color: '#f97316' }
          : { label: 'Restricted', color: '#ef4444' }
        const flat = p.flat && p.flat !== 'unknown' ? String(p.flat) : null
        const surface = String(p.surface || '').replace(/^[A-Z]+ - /, '')
        const maint = String(p.maint || '').replace(/^\d+ - /, '')
        const season = p.seasonal === 'seasonal' ? 'Seasonal (may close)' : p.seasonal === 'yearlong' ? 'Year-round' : null
        const row = (label: string, value: string, color = '#e7e5e4') =>
          `<div style="display:flex;justify-content:space-between;gap:14px;margin-top:5px"><span style="color:#a8a29e">${label}</span><span style="color:${color};font-weight:600;text-align:right">${value}</span></div>`
        const rows = [row('Access', access.label, access.color)]
        if (p.slope != null || flat) {
          const grade = `${p.slope != null ? `${p.slope}°` : ''}${p.slope != null && flat ? ' · ' : ''}${flat ? titleCase(flat) : ''}`
          rows.push(row('Grade', grade, flat ? FLAT_COLOR[flat] || '#e7e5e4' : '#e7e5e4'))
        }
        if (surface) rows.push(row('Surface', esc(titleCase(surface))))
        if (maint) rows.push(row('Suited for', esc(titleCase(maint))))
        if (season) rows.push(row('Season', season))
        const html = `<div style="font-family:system-ui,sans-serif;font-size:12px;min-width:196px">`
          + `<div style="font-weight:700;font-size:13px;color:#fff;padding-right:16px;line-height:1.25">${esc(name)}</div>`
          + rows.join('')
          + (p.forest ? `<div style="margin-top:8px;padding-top:7px;border-top:1px solid #44403c;color:#78716c;font-size:11px;line-height:1.3">${esc(p.forest)}</div>` : '')
          + `<div style="margin-top:6px;color:#57534e;font-size:10px;line-height:1.3">Verify access, legality &amp; closures on-site.</div>`
          + `</div>`
        new maplibregl.Popup({ offset: 8, closeButton: true, maxWidth: '250px' })
          .setLngLat(e.lngLat).setHTML(html).addTo(map)
      })
      map.on('mouseenter', 'mvum-roads', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'mvum-roads', () => { map.getCanvas().style.cursor = '' })
      map.on('moveend', emitBounds)
      readyRef.current = true
      setMapReady(true)
      emitBounds()
    })

    return () => { map.remove(); mapRef.current = null; readyRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── recolor / update campgrounds ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    ;(map.getSource('camps') as GeoJSONSource | undefined)?.setData(campsFC(campgrounds))
  }, [campgrounds, mapReady])

  // ── saved data + visibility ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    ;(map.getSource('saved') as GeoJSONSource | undefined)?.setData(savedFC(savedSites))
    if (map.getLayer('saved-circles')) {
      map.setLayoutProperty('saved-circles', 'visibility', showSaved ? 'visible' : 'none')
    }
  }, [savedSites, showSaved, mapReady])

  // ── selection highlight + ease ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    if (prevSelected.current && prevSelected.current !== selectedId) {
      map.setFeatureState({ source: 'camps', id: prevSelected.current }, { selected: false })
    }
    if (selectedId) {
      map.setFeatureState({ source: 'camps', id: selectedId }, { selected: true })
      const c = campgrounds.find((x) => x.id === selectedId)
      if (c) map.easeTo({ center: [c.lng, c.lat], zoom: Math.max(map.getZoom(), 11), duration: 600 })
    }
    prevSelected.current = selectedId
  }, [selectedId, campgrounds, mapReady])

  // ── fly to external center (search) ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !center) return
    map.flyTo({ center: [center.lng, center.lat], zoom: 10, duration: 1200, essential: true })
  }, [center])

  // ── drop-pin cursor ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    map.getCanvas().style.cursor = dropMode ? 'crosshair' : ''
  }, [dropMode])

  // ── dispersed-intel layer toggles (visibility sync; data loaded lazily once) ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    const setVis = (id: string, on: boolean) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
    }
    setVis('hillshade', showHillshade)
    setVis('publicland-fill', showPublicLand)
    setVis('publicland-outline', showPublicLand)
    setVis('mvum-casing', showRoads)
    setVis('mvum-roads', showRoads)
    // Streets mode hides the green landcover fills so roads + labels read clearly.
    for (const id of ['landcover', 'landuse_park', 'landuse_urban_green']) setVis(id, basemap === 'terrain')

    if (showPublicLand && !dataLoadedRef.current.publicLand) {
      dataLoadedRef.current.publicLand = true
      loadPublicLand()
        .then((d) => { (map.getSource('publicland') as GeoJSONSource | undefined)?.setData(d) })
        .catch(() => { dataLoadedRef.current.publicLand = false })
    }
    if (showRoads && !dataLoadedRef.current.roads) {
      dataLoadedRef.current.roads = true
      loadMVUM()
        .then((d) => { (map.getSource('mvum') as GeoJSONSource | undefined)?.setData(d) })
        .catch(() => { dataLoadedRef.current.roads = false })
    }
  }, [showPublicLand, showRoads, showHillshade, basemap, mapReady])

  return <div ref={containerRef} className="h-full w-full" />
}
