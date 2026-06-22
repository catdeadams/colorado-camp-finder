'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Campground, DispersedSpot, PublicLandFeature } from '@/lib/types'

interface Props {
  campgrounds: Campground[]
  center: { lat: number; lng: number } | null
  selectedId: string | null
  onSelect: (id: string) => void
  dispersedSpots?: DispersedSpot[]
  publicLandPolygons?: PublicLandFeature[]
  selectedDispersedId?: string | null
  onSelectDispersed?: (id: string) => void
}

const COLORS: Record<string, string> = {
  available: '#22c55e',
  limited: '#f59e0b',
  full: '#ef4444',
  unknown: '#6b7280',
}

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm-tiles', type: 'raster', source: 'osm' }],
}

// ── Tile math for offline cache ───────────────────────────────────────────────
function lonToTileX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}
function latToTileY(lat: number, z: number) {
  const r = Math.PI / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(lat * r) + 1 / Math.cos(lat * r)) / Math.PI) / 2) * 2 ** z
  )
}
function getTileUrls(bounds: maplibregl.LngLatBounds, minZ: number, maxZ: number): string[] {
  const urls: string[] = []
  for (let z = minZ; z <= maxZ; z++) {
    const x0 = lonToTileX(bounds.getWest(), z)
    const x1 = lonToTileX(bounds.getEast(), z)
    const y0 = latToTileY(bounds.getNorth(), z)
    const y1 = latToTileY(bounds.getSouth(), z)
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        urls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`)
  }
  return urls
}

// ── Popup HTML builders ───────────────────────────────────────────────────────
function buildPopupHTML(c: Campground): string {
  const color = COLORS[c.availability]
  const canReserve = c.availability === 'available' || c.availability === 'limited'
  const siteText =
    c.totalSites > 0
      ? canReserve ? `${c.availableSites}/${c.totalSites} sites open` : `${c.totalSites} sites — full`
      : c.availability

  return `
    <div style="font-family:system-ui,sans-serif;min-width:200px;max-width:240px;">
      <div style="font-weight:700;font-size:14px;color:#0c0a09;line-height:1.3;margin-bottom:6px;">${c.name}</div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:600;color:white;background:${color};">${siteText}</span>
        <span style="font-size:11px;color:#78716c;">${c.distance.toFixed(1)} mi</span>
      </div>
      <div style="display:flex;gap:6px;">
        <a href="${c.reserveUrl}" target="_blank" rel="noopener noreferrer" style="flex:1;display:block;text-align:center;background:${canReserve ? '#16a34a' : '#44403c'};color:white;padding:6px 10px;border-radius:7px;text-decoration:none;font-size:12px;font-weight:600;">${canReserve ? 'Reserve →' : 'View'}</a>
        <a href="${c.directionsUrl}" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;background:#44403c;color:#d6d3d1;padding:6px 10px;border-radius:7px;text-decoration:none;font-size:12px;font-weight:600;">↗ Dirs</a>
      </div>
    </div>`
}

function buildDispersedPopupHTML(s: DispersedSpot): string {
  const accessIcons: Record<string, string> = { paved: '🚗', gravel: '🚙', '4wd': '🛻', 'walk-in': '🥾', unknown: '❓' }
  return `
    <div style="font-family:system-ui,sans-serif;min-width:200px;max-width:240px;">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
        <span style="display:inline-block;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700;background:${s.landType === 'BLM' ? '#92400e33' : '#14532d33'};color:${s.landType === 'BLM' ? '#d97706' : '#16a34a'};border:1px solid ${s.landType === 'BLM' ? '#d9770644' : '#16a34a44'};">${s.landType}</span>
        <span style="font-weight:700;font-size:13px;color:#0c0a09;">${s.name}</span>
      </div>
      <div style="font-size:11px;color:#57534e;margin-bottom:8px;">
        ${s.flatnessRating !== 'unknown' ? s.flatnessRating.charAt(0).toUpperCase() + s.flatnessRating.slice(1) + ' terrain' : 'Terrain unknown'}
        ${s.slopeAngle > 0 ? ` · ${s.slopeAngle.toFixed(1)}°` : ''}
        ${s.elevationFt > 0 ? ` · ${s.elevationFt.toLocaleString()} ft` : ''}
      </div>
      <div style="font-size:11px;color:#57534e;margin-bottom:8px;">
        ${accessIcons[s.roadAccess] ?? '❓'} ${s.roadAccess} · ${s.distance.toFixed(1)} mi away
        ${s.estimatedFlatSpots > 0 ? ` · ~${s.estimatedFlatSpots} flat spot${s.estimatedFlatSpots !== 1 ? 's' : ''}` : ''}
      </div>
      <div style="display:flex;gap:6px;">
        <a href="${s.directionsUrl}" target="_blank" rel="noopener noreferrer" style="flex:1;display:block;text-align:center;background:#c2410c;color:white;padding:6px 10px;border-radius:7px;text-decoration:none;font-size:12px;font-weight:600;">↗ Directions</a>
        <a href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}" target="_blank" rel="noopener noreferrer" style="display:block;text-align:center;background:#44403c;color:#d6d3d1;padding:6px 10px;border-radius:7px;text-decoration:none;font-size:12px;font-weight:600;">Sat</a>
      </div>
    </div>`
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function CampgroundMap({
  campgrounds,
  center,
  selectedId,
  onSelect,
  dispersedSpots = [],
  publicLandPolygons = [],
  selectedDispersedId = null,
  onSelectDispersed,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const markersRef = useRef<Map<string, { marker: maplibregl.Marker; el: HTMLDivElement }>>(new Map())
  const dispersedMarkersRef = useRef<Map<string, { marker: maplibregl.Marker; el: HTMLDivElement }>>(new Map())
  const activePopup = useRef<maplibregl.Popup | null>(null)

  // Offline cache button state
  const [cacheState, setCacheState] = useState<'idle' | 'caching' | 'done'>('idle')
  const [cacheProgress, setCacheProgress] = useState({ done: 0, total: 0 })
  const [swReady, setSwReady] = useState(false)

  // ── Init map ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [-105.7821, 39.5501],
      zoom: 7,
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'imperial' }), 'bottom-left')
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // ── Service Worker readiness + message listener ───────────────────────────
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.ready.then(() => setSwReady(true))
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'CACHE_PROGRESS') {
        setCacheProgress({ done: e.data.done, total: e.data.total })
      } else if (e.data?.type === 'CACHE_DONE') {
        setCacheState('done')
        setTimeout(() => setCacheState('idle'), 4000)
      }
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [])

  function handleCacheArea() {
    const map = mapRef.current
    if (!map || !navigator.serviceWorker.controller) return
    const bounds = map.getBounds()
    const zoom = Math.round(map.getZoom())
    const minZ = Math.max(8, zoom - 1)
    const maxZ = Math.min(14, zoom + 2)
    const urls = getTileUrls(bounds, minZ, maxZ).slice(0, 1500)
    setCacheState('caching')
    setCacheProgress({ done: 0, total: urls.length })
    navigator.serviceWorker.controller.postMessage({ type: 'CACHE_TILES', urls })
  }

  // ── Public land polygons ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || publicLandPolygons.length === 0) return

    const add = () => {
      if (map.getLayer('public-land-fill')) map.removeLayer('public-land-fill')
      if (map.getLayer('public-land-outline')) map.removeLayer('public-land-outline')
      if (map.getSource('public-land')) map.removeSource('public-land')

      map.addSource('public-land', {
        type: 'geojson',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { type: 'FeatureCollection', features: publicLandPolygons } as any,
      })
      map.addLayer({
        id: 'public-land-fill', type: 'fill', source: 'public-land',
        paint: {
          'fill-color': ['match', ['get', 'landType'], 'BLM', '#D4A843', 'USFS', '#2D7A3A', '#888'],
          'fill-opacity': 0.22,
        },
      })
      map.addLayer({
        id: 'public-land-outline', type: 'line', source: 'public-land',
        paint: {
          'line-color': ['match', ['get', 'landType'], 'BLM', '#D4A843', 'USFS', '#2D7A3A', '#888'],
          'line-opacity': 0.55, 'line-width': 1,
        },
      })
    }
    if (map.isStyleLoaded()) add(); else map.once('load', add)
  }, [publicLandPolygons])

  // ── Campground markers ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const currentIds = new Set(campgrounds.map((c) => c.id))
    for (const [id, { marker }] of markersRef.current) {
      if (!currentIds.has(id)) { marker.remove(); markersRef.current.delete(id) }
    }

    for (const cg of campgrounds) {
      if (markersRef.current.has(cg.id) || !cg.lat || !cg.lng) continue
      const color = COLORS[cg.availability]
      const el = document.createElement('div')
      el.style.cssText = `width:30px;height:30px;border-radius:50%;background:${color};border:3px solid white;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:13px;transition:transform .15s,box-shadow .15s;`
      el.textContent = '⛺'; el.title = cg.name
      el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.25)'; el.style.boxShadow = '0 4px 16px rgba(0,0,0,.5)' })
      el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; el.style.boxShadow = '0 2px 10px rgba(0,0,0,.45)' })
      const popup = new maplibregl.Popup({ offset: 18, closeButton: true, maxWidth: '260px' }).setHTML(buildPopupHTML(cg))
      const marker = new maplibregl.Marker({ element: el }).setLngLat([cg.lng, cg.lat]).setPopup(popup).addTo(map)
      el.addEventListener('click', () => { onSelect(cg.id); activePopup.current?.remove(); marker.togglePopup(); activePopup.current = popup })
      markersRef.current.set(cg.id, { marker, el })
    }
  }, [campgrounds, onSelect])

  // ── Dispersed markers ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    const currentIds = new Set(dispersedSpots.map((s) => s.id))
    for (const [id, { marker }] of dispersedMarkersRef.current) {
      if (!currentIds.has(id)) { marker.remove(); dispersedMarkersRef.current.delete(id) }
    }

    const addMarkers = () => {
      for (const spot of dispersedSpots) {
        if (dispersedMarkersRef.current.has(spot.id) || !spot.lat || !spot.lng) continue
        const el = document.createElement('div')
        el.style.cssText = `width:28px;height:28px;border-radius:50%;background:#ea580c;border:2.5px solid #fff7ed;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:12px;transition:transform .15s,box-shadow .15s;`
        el.textContent = '🌲'; el.title = spot.name
        el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.25)'; el.style.boxShadow = '0 4px 14px rgba(0,0,0,.55)' })
        el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; el.style.boxShadow = '0 2px 8px rgba(0,0,0,.45)' })
        const popup = new maplibregl.Popup({ offset: 18, closeButton: true, maxWidth: '260px' }).setHTML(buildDispersedPopupHTML(spot))
        const marker = new maplibregl.Marker({ element: el }).setLngLat([spot.lng, spot.lat]).setPopup(popup).addTo(map)
        el.addEventListener('click', () => { onSelectDispersed?.(spot.id); activePopup.current?.remove(); marker.togglePopup(); activePopup.current = popup })
        dispersedMarkersRef.current.set(spot.id, { marker, el })
      }
    }
    if (map.isStyleLoaded()) addMarkers(); else map.once('load', addMarkers)
  }, [dispersedSpots, onSelectDispersed])

  // ── Fly to search center ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !center) return
    mapRef.current.flyTo({ center: [center.lng, center.lat], zoom: 10, duration: 1400, essential: true })
  }, [center])

  // ── Highlight selected campground ─────────────────────────────────────────
  useEffect(() => {
    for (const [id, { el }] of markersRef.current) {
      el.style.transform = id === selectedId ? 'scale(1.35)' : 'scale(1)'
      el.style.zIndex = id === selectedId ? '10' : '0'
    }
    if (!selectedId) return
    const cg = campgrounds.find((c) => c.id === selectedId)
    const entry = cg && markersRef.current.get(selectedId)
    if (!entry || !cg) return
    mapRef.current?.easeTo({ center: [cg.lng, cg.lat], zoom: Math.max(12, mapRef.current.getZoom()), duration: 600 })
    activePopup.current?.remove(); entry.marker.togglePopup(); activePopup.current = entry.marker.getPopup()
  }, [selectedId, campgrounds])

  // ── Highlight selected dispersed spot ─────────────────────────────────────
  useEffect(() => {
    for (const [id, { el }] of dispersedMarkersRef.current) {
      el.style.transform = id === selectedDispersedId ? 'scale(1.35)' : 'scale(1)'
      el.style.zIndex = id === selectedDispersedId ? '10' : '5'
    }
    if (!selectedDispersedId) return
    const spot = dispersedSpots.find((s) => s.id === selectedDispersedId)
    const entry = spot && dispersedMarkersRef.current.get(selectedDispersedId)
    if (!entry || !spot) return
    mapRef.current?.easeTo({ center: [spot.lng, spot.lat], zoom: Math.max(12, mapRef.current?.getZoom() ?? 10), duration: 600 })
    activePopup.current?.remove(); entry.marker.togglePopup(); activePopup.current = entry.marker.getPopup()
  }, [selectedDispersedId, dispersedSpots])

  const hasDispersed = dispersedSpots.length > 0

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      {/* Offline cache button */}
      {swReady && (
        <div className="absolute top-14 right-3 z-10">
          <button
            onClick={handleCacheArea}
            disabled={cacheState === 'caching'}
            title="Download map tiles for offline use"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold shadow-lg backdrop-blur-sm transition-all ${
              cacheState === 'done'
                ? 'bg-green-600/90 text-white border border-green-500/50'
                : cacheState === 'caching'
                  ? 'bg-stone-800/90 text-stone-400 border border-stone-700/50 cursor-wait'
                  : 'bg-stone-900/90 hover:bg-stone-800/90 text-stone-300 border border-stone-700/50'
            }`}
          >
            {cacheState === 'done' ? '✓ Cached offline' :
             cacheState === 'caching' ? `⬇ ${cacheProgress.done}/${cacheProgress.total}` :
             '⬇ Save map area'}
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-8 right-3 bg-stone-900/90 backdrop-blur-md rounded-xl border border-stone-700/50 p-3 text-xs shadow-xl">
        <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5">Campgrounds</div>
        {Object.entries(COLORS).map(([status, color]) => (
          <div key={status} className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full border border-white/30 flex-shrink-0" style={{ background: color }} />
            <span className="text-stone-400 capitalize">{status}</span>
          </div>
        ))}
        {hasDispersed && (
          <>
            <div className="border-t border-stone-700/60 my-2" />
            <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5">Dispersed</div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-3 rounded-full border border-amber-200/30 flex-shrink-0" style={{ background: '#ea580c' }} />
              <span className="text-stone-400">BLM / USFS</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-3 h-2 rounded-sm flex-shrink-0 opacity-60" style={{ background: '#D4A843' }} />
              <span className="text-stone-400">BLM land</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-2 rounded-sm flex-shrink-0 opacity-60" style={{ background: '#2D7A3A' }} />
              <span className="text-stone-400">USFS land</span>
            </div>
          </>
        )}
      </div>

      {/* Empty state */}
      {campgrounds.length === 0 && dispersedSpots.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-stone-900/80 backdrop-blur-sm rounded-2xl px-6 py-4 text-center border border-stone-700/40">
            <div className="text-3xl mb-2">🗺️</div>
            <p className="text-stone-400 text-sm font-medium">Search to see campgrounds on the map</p>
          </div>
        </div>
      )}
    </div>
  )
}
