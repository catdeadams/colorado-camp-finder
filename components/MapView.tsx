'use client'

import { useEffect, useRef } from 'react'
import maplibregl, { type GeoJSONSource } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { FeatureCollection } from 'geojson'
import { TOPO_STYLE, CO_CENTER } from '@/lib/basemap'
import type { Campground, PinStatus } from '@/lib/types'
import type { SavedSite } from '@/lib/store'

export interface MapBounds { west: number; south: number; east: number; north: number }

interface Props {
  campgrounds: Campground[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  center?: { lat: number; lng: number } | null
  savedSites?: SavedSite[]
  showSaved?: boolean
  onBoundsChange?: (b: MapBounds) => void
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
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const onSelectRef = useRef(onSelect)
  const onBoundsRef = useRef(onBoundsChange)
  const prevSelected = useRef<string | null>(null)
  useEffect(() => { onSelectRef.current = onSelect }, [onSelect])
  useEffect(() => { onBoundsRef.current = onBoundsChange }, [onBoundsChange])

  // ── init map ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: TOPO_STYLE,
      center: CO_CENTER,
      zoom: 6.4,
      maxZoom: 16,
      attributionControl: { compact: true },
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
          'circle-color': '#d97706',
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#fde68a',
          'circle-opacity': 0.9,
        },
      })

      map.on('click', 'camp-circles', (e) => {
        const f = e.features?.[0]
        if (f) onSelectRef.current(String(f.properties?.id))
      })
      map.on('mouseenter', 'camp-circles', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'camp-circles', () => { map.getCanvas().style.cursor = '' })
      map.on('click', (e) => {
        if (map.queryRenderedFeatures(e.point, { layers: ['camp-circles'] }).length === 0) {
          onSelectRef.current(null)
        }
      })
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

  return <div ref={containerRef} className="absolute inset-0" />
}
