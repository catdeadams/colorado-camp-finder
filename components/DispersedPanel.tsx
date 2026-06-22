'use client'

import { useState, useEffect, useCallback } from 'react'
import DispersedCard from './DispersedCard'
import type { DispersedSpot, PublicLandFeature } from '@/lib/types'

interface Props {
  searchLat: number | null
  searchLng: number | null
  searchRadius: number
  onPolygonsLoaded: (polygons: PublicLandFeature[]) => void
  onSpotsLoaded?: (spots: DispersedSpot[]) => void
  selectedId: string | null
  onSelect: (id: string) => void
}

export default function DispersedPanel({
  searchLat,
  searchLng,
  searchRadius,
  onPolygonsLoaded,
  onSpotsLoaded,
  selectedId,
  onSelect,
}: Props) {
  const [spots, setSpots] = useState<DispersedSpot[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    if (!searchLat || !searchLng) return
    setLoading(true)
    setError(null)

    try {
      const q = new URLSearchParams({
        lat: searchLat.toString(),
        lng: searchLng.toString(),
        radius: searchRadius.toString(),
      })
      const res = await fetch(`/api/dispersed?${q}`)
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to load dispersed spots')
      }
      const data = await res.json()
      const loadedSpots = data.spots ?? []
      setSpots(loadedSpots)
      onPolygonsLoaded(data.polygons ?? [])
      onSpotsLoaded?.(loadedSpots)
      setLoaded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }, [searchLat, searchLng, searchRadius, onPolygonsLoaded])

  // Auto-load when we have a location
  useEffect(() => {
    if (searchLat && searchLng && !loaded && !loading) {
      load()
    }
  }, [searchLat, searchLng, loaded, loading, load])

  if (!searchLat || !searchLng) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="text-5xl mb-4">🌲</div>
        <p className="text-stone-300 font-semibold">Dispersed camping suggestions</p>
        <p className="text-stone-500 text-sm mt-2 leading-relaxed">
          Run a campground search first to set your location, then switch to this tab for BLM and National Forest dispersed spots
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="text-5xl mb-4 animate-pulse">🏕️</div>
        <p className="text-stone-300 font-semibold text-sm">Analyzing terrain...</p>
        <div className="mt-4 space-y-1.5 text-xs text-stone-500">
          <p>Querying BLM & Forest Service boundaries</p>
          <p>Sampling USGS elevation data</p>
          <p>Checking road access via OpenStreetMap</p>
        </div>
        <p className="text-stone-600 text-xs mt-4">This takes ~20–30 seconds</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4 text-sm text-red-400">
          <div className="font-semibold mb-1">Dispersed search failed</div>
          <div className="text-xs text-red-400/80 mb-3">{error}</div>
          <button
            onClick={load}
            className="text-xs bg-stone-800 hover:bg-stone-700 text-stone-300 px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            Try again
          </button>
        </div>
        <div className="mt-3 text-xs text-stone-500 bg-stone-800/40 rounded-xl p-3">
          Dispersed data comes from the BLM ArcGIS service, which can occasionally be slow or down.
        </div>
      </div>
    )
  }

  if (loaded && spots.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="text-5xl mb-4">🗺️</div>
        <p className="text-stone-300 font-semibold">No public land found nearby</p>
        <p className="text-stone-500 text-sm mt-2">
          This area may be mostly private land. Try expanding your search radius or moving to a different location.
        </p>
      </div>
    )
  }

  const flat = spots.filter((s) => s.flatnessRating === 'flat' || s.flatnessRating === 'gentle')
  const other = spots.filter((s) => s.flatnessRating !== 'flat' && s.flatnessRating !== 'gentle')

  return (
    <div className="p-3 space-y-4">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs text-stone-500">{spots.length} public land areas · BLM &amp; USFS</span>
        <button onClick={load} className="text-[10px] text-stone-600 hover:text-stone-400">Refresh</button>
      </div>

      {/* Disclaimer */}
      <div className="mx-1 text-[10px] text-stone-600 bg-stone-800/30 rounded-lg px-3 py-2 leading-relaxed">
        Spots shown are centroids of BLM/USFS parcels — not guaranteed accessible. Always verify land status and road conditions before heading out.
      </div>

      {flat.length > 0 && (
        <section>
          <div className="flex items-center gap-2 px-1 mb-2">
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Flat / Gentle terrain</span>
            <div className="flex-1 h-px bg-stone-800" />
            <span className="text-[10px] text-stone-600">{flat.length}</span>
          </div>
          <div className="space-y-2">
            {flat.map((s) => (
              <DispersedCard key={s.id} spot={s} selected={selectedId === s.id} onSelect={() => onSelect(s.id)} />
            ))}
          </div>
        </section>
      )}

      {other.length > 0 && (
        <section className="mt-2">
          <div className="flex items-center gap-2 px-1 mb-2">
            <span className="text-[10px] font-bold text-stone-600 uppercase tracking-widest">Steeper terrain</span>
            <div className="flex-1 h-px bg-stone-800" />
            <span className="text-[10px] text-stone-600">{other.length}</span>
          </div>
          <div className="space-y-2">
            {other.map((s) => (
              <DispersedCard key={s.id} spot={s} selected={selectedId === s.id} onSelect={() => onSelect(s.id)} />
            ))}
          </div>
        </section>
      )}

      <div className="h-4" />
    </div>
  )
}
