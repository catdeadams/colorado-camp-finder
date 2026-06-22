'use client'

import { useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import SearchForm from '@/components/SearchForm'
import CampgroundList from '@/components/CampgroundList'
import WatchesPanel from '@/components/WatchesPanel'
import WatchModal from '@/components/WatchModal'
import DispersedPanel from '@/components/DispersedPanel'
import SavedPanel from '@/components/SavedPanel'
import type { Campground, DispersedSpot, PublicLandFeature, SearchParams } from '@/lib/types'

const CampgroundMap = dynamic(() => import('@/components/CampgroundMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-stone-900">
      <p className="text-stone-600 text-sm">Loading map...</p>
    </div>
  ),
})

type SidebarTab = 'search' | 'dispersed' | 'saved' | 'watches'

export default function HomePage() {
  const [tab, setTab] = useState<SidebarTab>('search')

  // Campground search state
  const [campgrounds, setCampgrounds] = useState<Campground[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [currentDates, setCurrentDates] = useState({ startDate: '', endDate: '' })
  const [currentQuery, setCurrentQuery] = useState('')
  const [watchTarget, setWatchTarget] = useState<Campground | null>(null)
  const [watchCount, setWatchCount] = useState(0)
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({})

  // Dispersed state
  const [dispersedSpots, setDispersedSpots] = useState<DispersedSpot[]>([])
  const [publicLandPolygons, setPublicLandPolygons] = useState<PublicLandFeature[]>([])
  const [selectedDispersedId, setSelectedDispersedId] = useState<string | null>(null)
  const [searchLat, setSearchLat] = useState<number | null>(null)
  const [searchLng, setSearchLng] = useState<number | null>(null)
  const [searchRadius, setSearchRadius] = useState(50)

  const handleSearch = useCallback(async (params: SearchParams) => {
    setLoading(true)
    setError(null)
    setHasSearched(true)
    setCampgrounds([])
    setSelectedId(null)
    setCurrentDates({ startDate: params.startDate, endDate: params.endDate })
    setCurrentQuery(params.query)
    setSearchRadius(params.radiusMiles)
    setDispersedSpots([])
    setPublicLandPolygons([])
    setSelectedDispersedId(null)

    try {
      let lat: number, lng: number

      if (params.gpsLat != null && params.gpsLng != null) {
        // GPS path — skip geocoding
        lat = params.gpsLat
        lng = params.gpsLng
      } else {
        // Text geocoding path
        const geoRes = await fetch(`/api/geocode?q=${encodeURIComponent(params.query)}`)
        if (!geoRes.ok) {
          const err = await geoRes.json()
          throw new Error(err.error || 'Could not find that location')
        }
        const geo = await geoRes.json()
        lat = geo.lat
        lng = geo.lng
      }

      setMapCenter({ lat, lng })
      setSearchLat(lat)
      setSearchLng(lng)

      const q = new URLSearchParams({
        lat: lat.toString(),
        lng: lng.toString(),
        radius: params.radiusMiles.toString(),
        startDate: params.startDate,
        endDate: params.endDate,
        sources: params.enabledSources.join(','),
      })
      const searchRes = await fetch(`/api/search?${q}`)
      if (!searchRes.ok) {
        const err = await searchRes.json()
        throw new Error(err.error || 'Search failed')
      }
      const data = await searchRes.json()
      setCampgrounds(data.campgrounds)
      setSourceCounts(data.sources || {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
    } finally {
      setLoading(false)
    }
  }, [])

  const availableCount = campgrounds.filter(
    (c) => c.availability === 'available' || c.availability === 'limited'
  ).length

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-[400px] flex-shrink-0 flex flex-col border-r border-stone-800 overflow-hidden">
        {/* Brand + tabs */}
        <header className="flex-shrink-0 bg-stone-900 border-b border-stone-800">
          <div className="px-4 py-3 flex items-center gap-2.5">
            <span className="text-2xl">⛺</span>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">Colorado Camp Finder</h1>
              <p className="text-[11px] text-stone-500">rec.gov · CO State Parks · Free Camping</p>
            </div>
          </div>

          <div className="flex border-t border-stone-800">
            {(
              [
                { id: 'search',    label: 'Search',    accent: 'border-green-500' },
                { id: 'dispersed', label: 'Dispersed', accent: 'border-orange-500' },
                { id: 'saved',     label: 'Saved',     accent: 'border-amber-500' },
                { id: 'watches',   label: 'Watches',   accent: 'border-green-500' },
              ] as { id: SidebarTab; label: string; accent: string }[]
            ).map(({ id, label, accent }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex-1 py-2 text-xs font-semibold transition-colors relative ${
                  tab === id ? `text-white border-b-2 ${accent}` : 'text-stone-500 hover:text-stone-300'
                }`}
              >
                {label}
                {id === 'dispersed' && dispersedSpots.length > 0 && (
                  <span className="ml-0.5 text-[9px] bg-orange-600/80 text-white px-1 py-0.5 rounded-full font-bold">
                    {dispersedSpots.length}
                  </span>
                )}
                {id === 'watches' && watchCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-green-600 text-[9px] text-white flex items-center justify-center font-bold">
                    {watchCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        {/* Search form */}
        {tab === 'search' && (
          <div className="px-4 py-4 border-b border-stone-800 bg-stone-900/50 flex-shrink-0">
            <SearchForm onSearch={handleSearch} loading={loading} />
          </div>
        )}

        {/* Result count + source breakdown */}
        {tab === 'search' && hasSearched && !loading && !error && campgrounds.length > 0 && (
          <div className="px-4 py-2 bg-stone-900/30 border-b border-stone-800/50 flex-shrink-0 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-500">{campgrounds.length} campgrounds (after dedup)</span>
              {availableCount > 0 ? (
                <span className="text-green-400 font-semibold">{availableCount} open</span>
              ) : (
                <span className="text-red-400">None available</span>
              )}
            </div>
            {Object.keys(sourceCounts).length > 0 && (
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-stone-600">
                {Object.entries(sourceCounts).filter(([, n]) => n > 0).map(([src, n]) => (
                  <span key={src}>{src}: {n}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content area */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'search' && (
            <CampgroundList
              campgrounds={campgrounds}
              loading={loading}
              error={error}
              hasSearched={hasSearched}
              searchQuery={currentQuery}
              startDate={currentDates.startDate}
              endDate={currentDates.endDate}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onWatch={(c) => setWatchTarget(c)}
            />
          )}
          {tab === 'dispersed' && (
            <DispersedPanel
              searchLat={searchLat}
              searchLng={searchLng}
              searchRadius={searchRadius}
              onPolygonsLoaded={setPublicLandPolygons}
              onSpotsLoaded={setDispersedSpots}
              selectedId={selectedDispersedId}
              onSelect={(id) => {
                setSelectedDispersedId(id)
                const spot = dispersedSpots.find((s) => s.id === id)
                if (spot) setMapCenter({ lat: spot.lat, lng: spot.lng })
              }}
            />
          )}
          {tab === 'saved' && <SavedPanel />}
          {tab === 'watches' && <WatchesPanel key={watchCount} />}
        </div>
      </aside>

      {/* ── Map ── */}
      <main className="flex-1 relative overflow-hidden">
        <CampgroundMap
          campgrounds={campgrounds}
          center={mapCenter}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setTab('search') }}
          dispersedSpots={dispersedSpots}
          publicLandPolygons={publicLandPolygons}
          selectedDispersedId={selectedDispersedId}
          onSelectDispersed={(id) => { setSelectedDispersedId(id); setTab('dispersed') }}
        />
      </main>

      {/* ── Watch modal ── */}
      {watchTarget && (
        <WatchModal
          campground={watchTarget}
          startDate={currentDates.startDate}
          endDate={currentDates.endDate}
          onClose={() => setWatchTarget(null)}
          onSaved={() => { setWatchTarget(null); setWatchCount((n) => n + 1); setTab('watches') }}
        />
      )}
    </div>
  )
}
