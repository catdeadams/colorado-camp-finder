'use client'

import { useEffect, useRef } from 'react'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Protocol } from 'pmtiles'
import type { FeatureCollection } from 'geojson'
import { buildTopoStyle, CO_CENTER } from '@/lib/basemap'
import { loadPublicLand, loadMVUM } from '@/lib/dataset'
import type { Campground, PinStatus } from '@/lib/types'
import type { SavedSite } from '@/lib/store'

let pmtilesRegistered = false

export interface MapBounds { west: number; south: number; east: number; north: number }

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
        properties: { id: c.id, status: statusOf(c) },
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

export default function MapView({
  campgrounds, selectedId, onSelect, center, savedSites = [], showSaved = true, onBoundsChange,
  dropMode = false, onMapPoint,
  showPublicLand = false, showRoads = false, showHillshade = false,
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
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { onBoundsRef.current = onBoundsChange }, [onBoundsChange])
  useEffect(() => { onMapPointRef.current = onMapPoint }, [onMapPoint])
  useEffect(() => { dropModeRef.current = dropMode }, [dropMode])

  // ── init map ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!pmtilesRegistered) { maplibregl.addProtocol('pmtiles', new Protocol().tile); pmtilesRegistered = true }
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildTopoStyle(`pmtiles://${window.location.origin}/co-basemap.pmtiles`),
      center: CO_CENTER,
      zoom: 6.4,
      maxZoom: 16,
      attributionControl: { compact: true },
      preserveDrawingBuffer: true,
    })
    mapRef.current = map
    if (typeof window !== 'undefined') (window as unknown as { __campmap?: maplibregl.Map }).__campmap = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true }, trackUserLocation: true,
    }), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left')

    const emitBounds = () => {
      const b = map.getBounds()
      onBoundsRef.current?.({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() })
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
          'circle-color': ['match', ['get', 'status'],
            'available', '#22c55e', 'limited', '#f59e0b', 'full', '#ef4444', 'first-come', '#3b82f6', '#9ca3af'],
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
      map.addLayer({
        id: 'mvum-roads', type: 'line', source: 'mvum', minzoom: 8, layout: { visibility: 'none', 'line-cap': 'round' },
        paint: {
          'line-color': ['match', ['get', 'flat'],
            'flat', '#16a34a', 'gentle', '#84cc16', 'moderate', '#f59e0b', 'steep', '#dc2626', '#9ca3af'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.8, 13, 2.2],
          'line-opacity': 0.8,
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
        const access = p.car === 'open' ? 'Cars OK' : p.hc === 'open' ? 'High-clearance' : p.fourwd === 'open' ? '4WD only' : 'Restricted'
        const surface = String(p.surface || '').replace(/^[A-Z]+ - /, '')
        new maplibregl.Popup({ offset: 6, closeButton: true, maxWidth: '230px' })
          .setLngLat(e.lngLat)
          .setHTML(`<div style="font-family:system-ui,sans-serif;font-size:12px;min-width:150px"><b>${p.name || 'Forest road'}</b><br>${access} · ${p.flat || '?'} terrain${p.slope != null ? ` (${p.slope}°)` : ''}<br><span style="color:#78716c;font-size:11px">${surface}${p.forest ? ' · ' + p.forest : ''}</span></div>`)
          .addTo(map)
      })
      map.on('mouseenter', 'mvum-roads', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'mvum-roads', () => { map.getCanvas().style.cursor = '' })
      map.on('moveend', emitBounds)
      readyRef.current = true
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
  }, [campgrounds])

  // ── saved data + visibility ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !readyRef.current) return
    ;(map.getSource('saved') as GeoJSONSource | undefined)?.setData(savedFC(savedSites))
    if (map.getLayer('saved-circles')) {
      map.setLayoutProperty('saved-circles', 'visibility', showSaved ? 'visible' : 'none')
    }
  }, [savedSites, showSaved])

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
  }, [selectedId, campgrounds])

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
    setVis('mvum-roads', showRoads)

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
  }, [showPublicLand, showRoads, showHillshade])

  return <div ref={containerRef} className="h-full w-full" />
}
