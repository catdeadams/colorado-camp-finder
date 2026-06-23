'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import dynamic from 'next/dynamic'
import SearchForm from '@/components/SearchForm'
import CampgroundList from '@/components/CampgroundList'
import WatchesPanel from '@/components/WatchesPanel'
import WatchModal from '@/components/WatchModal'
import DispersedPanel from '@/components/DispersedPanel'
import SavedPanel from '@/components/SavedPanel'
import Icon from '@/components/Icon'
import { getSaved } from '@/lib/saved'
import { checkCampgroundAvailability, checkFlexibleAvailability } from '@/lib/availabilityClient'
import type { Campground, DispersedSpot, PublicLandFeature, SearchParams, AvailabilityStatus } from '@/lib/types'

const CampgroundMap = dynamic(() => import('@/components/CampgroundMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-stone-900">
      <p className="text-stone-600 text-sm">Loading map...</p>
    </div>
  ),
})

type SidebarTab = 'search' | 'dispersed' | 'saved' | 'watches'

interface AvailOverride {
  status: AvailabilityStatus
  availableSites: number
  totalSites: number
}

function nextWeekendDefaults() {
  const now = new Date()
  const day = now.getDay()
  const daysToFriday = day <= 5 ? (5 - day || 7) : 6
  const friday = new Date(now)
  friday.setDate(now.getDate() + daysToFriday)
  const sunday = new Date(friday)
  sunday.setDate(friday.getDate() + 2)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { startDate: fmt(friday), endDate: fmt(sunday) }
}

export default function HomePage() {
  const [tab, setTab] = useState<SidebarTab>('search')
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // Campground search state
  const [campgrounds, setCampgrounds] = useState<Campground[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null)
  const [mapViewCenter, setMapViewCenter] = useState({ lat: 39.5501, lng: -105.7821 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hasSearched, setHasSearched] = useState(false)
  const [currentDates, setCurrentDates] = useState(() => {
    const d = nextWeekendDefaults()
    return { startDate: d.startDate, endDate: d.endDate, dateMode: 'exact', tripNights: 2 }
  })
  const [currentQuery, setCurrentQuery] = useState('')
  const [watchTarget, setWatchTarget] = useState<Campground | null>(null)
  const [watchCount, setWatchCount] = useState(0)
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({})
  const [searchKey, setSearchKey] = useState(0)

  // Client-side availability overrides (browser fetches rec.gov directly)
  const [availOverrides, setAvailOverrides] = useState<Record<string, AvailOverride>>({})
  const [availChecking, setAvailChecking] = useState(false)
  const [availCheckTriggered, setAvailCheckTriggered] = useState(false)
  const [availProgress, setAvailProgress] = useState({ done: 0, total: 0 })

  // Dispersed state
  const [dispersedSpots, setDispersedSpots] = useState<DispersedSpot[]>([])
  const [publicLandPolygons, setPublicLandPolygons] = useState<PublicLandFeature[]>([])
  const [selectedDispersedId, setSelectedDispersedId] = useState<string | null>(null)
  const [searchLat, setSearchLat] = useState<number | null>(null)
  const [searchLng, setSearchLng] = useState<number | null>(null)
  const [searchRadius, setSearchRadius] = useState(50)
  const [lastVehicleType, setLastVehicleType] = useState<'car' | 'awd' | '4wd'>('awd')

  // Saved campgrounds for map layer
  const [savedCampgrounds, setSavedCampgrounds] = useState<Campground[]>([])
  const [showSaved, setShowSaved] = useState(true)

  // Load saved campgrounds from localStorage
  useEffect(() => {
    const items = getSaved()
    setSavedCampgrounds(items.filter((i) => i.type === 'campground').map((i) => i.campground!))
  }, [])

  // Re-sync saved campgrounds when switching to/from Saved tab
  useEffect(() => {
    const items = getSaved()
    setSavedCampgrounds(items.filter((i) => i.type === 'campground').map((i) => i.campground!))
  }, [tab])

  // Merge availability overrides into the campground list
  const displayedCampgrounds = useMemo(() => {
    if (Object.keys(availOverrides).length === 0) return campgrounds
    return campgrounds.map((c) => {
      const ov = availOverrides[c.id]
      if (!ov) return c
      return { ...c, availability: ov.status, availableSites: ov.availableSites, totalSites: ov.totalSites }
    })
  }, [campgrounds, availOverrides])

  // Explicit availability check — triggered by the user, not automatically
  const handleCheckAvailability = useCallback(() => {
    const recgovCamps = campgrounds.filter((c) => c.source === 'recgov')
    if (recgovCamps.length === 0 || !currentDates.startDate || !currentDates.endDate) return

    setAvailOverrides({})
    setAvailChecking(true)
    setAvailCheckTriggered(true)
    setAvailProgress({ done: 0, total: recgovCamps.length })

    const startDate = new Date(`${currentDates.startDate}T00:00:00Z`)
    const endDate = new Date(`${currentDates.endDate}T00:00:00Z`)
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
      setAvailChecking(false)
      return
    }

    const isFlexible = currentDates.dateMode === 'flexible'
    let pending = recgovCamps.length

    recgovCamps.forEach((camp) => {
      const check = isFlexible
        ? checkFlexibleAvailability(camp.id, startDate, endDate, currentDates.tripNights)
        : checkCampgroundAvailability(camp.id, startDate, endDate)

      check
        .then((result) => {
          setAvailOverrides((prev) => ({ ...prev, [camp.id]: result }))
        })
        .catch(() => { /* stays unknown */ })
        .finally(() => {
          pending--
          setAvailProgress((p) => ({ ...p, done: p.done + 1 }))
          if (pending === 0) setAvailChecking(false)
        })
    })
  }, [campgrounds, currentDates])

  const handleSearch = useCallback(async (params: SearchParams) => {
    setLoading(true)
    setError(null)
    setHasSearched(true)
    setCampgrounds([])
    setAvailOverrides({})
    setAvailChecking(false)
    setAvailCheckTriggered(false)
    setAvailProgress({ done: 0, total: 0 })
    setSelectedId(null)
    setCurrentDates({
      startDate: params.dateMode === 'flexible' ? (params.windowStart ?? '') : params.startDate,
      endDate:   params.dateMode === 'flexible' ? (params.windowEnd   ?? '') : params.endDate,
      dateMode: params.dateMode,
      tripNights: params.tripNights ?? 2,
    })
    setCurrentQuery(params.query)
    setSearchRadius(params.radiusMiles)
    setDispersedSpots([])
    setPublicLandPolygons([])
    setSelectedDispersedId(null)
    setLastVehicleType(params.vehicleType)
    setSearchKey((k) => k + 1)

    try {
      let lat: number, lng: number

      if (params.gpsLat != null && params.gpsLng != null) {
        lat = params.gpsLat
        lng = params.gpsLng
      } else if (params.query.trim()) {
        const geoRes = await fetch(`/api/geocode?q=${encodeURIComponent(params.query)}`)
        if (!geoRes.ok) {
          const err = await geoRes.json()
          throw new Error(err.error || 'Could not find that location')
        }
        const geo = await geoRes.json()
        lat = geo.lat
        lng = geo.lng
      } else {
        // No text and no GPS — use current map viewport center
        lat = mapViewCenter.lat
        lng = mapViewCenter.lng
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
        vehicleType: params.vehicleType,
        dateMode: params.dateMode,
        amenities: params.amenities.join(','),
      })
      if (params.dateMode === 'flexible') {
        if (params.windowStart) q.set('windowStart', params.windowStart)
        if (params.windowEnd)   q.set('windowEnd',   params.windowEnd)
        if (params.tripNights)  q.set('tripNights',  params.tripNights.toString())
      }

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
  }, [mapViewCenter])

  // "Search this area" — called by the map when user clicks the viewport search button
  const handleSearchArea = useCallback(async (lat: number, lng: number, radiusMiles: number) => {
    setLoading(true)
    setError(null)
    setHasSearched(true)
    setCampgrounds([])
    setAvailOverrides({})
    setAvailChecking(false)
    setAvailCheckTriggered(false)
    setAvailProgress({ done: 0, total: 0 })
    setSelectedId(null)
    setDispersedSpots([])
    setPublicLandPolygons([])
    setSelectedDispersedId(null)
    setSearchRadius(radiusMiles)
    setSearchKey((k) => k + 1)
    setSearchLat(lat)
    setSearchLng(lng)

    // Keep existing dates / sources from current search state
    const q = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      radius: radiusMiles.toString(),
      startDate: currentDates.startDate,
      endDate: currentDates.endDate,
      sources: 'recgov,cpw,freecampsites,thedyrt,ioverlander',
      vehicleType: lastVehicleType,
      dateMode: currentDates.dateMode,
      amenities: '',
    })

    try {
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
  }, [currentDates, lastVehicleType])

  const availableCount = displayedCampgrounds.filter(
    (c) => c.availability === 'available' || c.availability === 'limited'
  ).length

  const hasRecgov = campgrounds.some((c) => c.source === 'recgov')

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Sidebar ── */}
      <aside
        className={`flex-shrink-0 flex flex-col border-r border-stone-800 bg-stone-950 transition-all duration-200 overflow-hidden ${
          sidebarOpen ? 'w-[380px]' : 'w-0 border-r-0'
        }`}
      >
        {/* Brand + tabs */}
        <header className="flex-shrink-0 bg-stone-900 border-b border-stone-800">
          <div className="px-4 py-3 flex items-center gap-2.5">
            <Icon name="tent" className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white leading-tight">Colorado Camp Finder</h1>
              <p className="text-[10px] text-stone-500">rec.gov · CO State Parks · Free Camping</p>
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
                className={`flex-1 py-2 text-[11px] font-semibold transition-colors relative ${
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

        {/* Unified scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {tab === 'search' && (
            <>
              <div className="px-4 py-4 border-b border-stone-800 bg-stone-900/40">
                <SearchForm onSearch={handleSearch} loading={loading} />
              </div>

              {hasSearched && !loading && !error && campgrounds.length > 0 && (
                <>
                  <div className="px-4 py-2 bg-stone-900/30 border-b border-stone-800/50 flex items-center justify-between text-xs">
                    <span className="text-stone-500">{campgrounds.length} campgrounds</span>
                    <div className="flex items-center gap-3">
                      {Object.entries(sourceCounts).filter(([, n]) => n > 0).map(([src, n]) => (
                        <span key={src} className="text-[10px] text-stone-600">{src}: {n}</span>
                      ))}
                      {availChecking ? (
                        <span className="text-[10px] text-stone-500 tabular-nums">
                          {availProgress.done}/{availProgress.total} checked…
                        </span>
                      ) : availCheckTriggered ? (
                        availableCount > 0 ? (
                          <span className="text-green-400 font-semibold">{availableCount} open</span>
                        ) : (
                          <span className="text-red-400 text-[10px]">None available</span>
                        )
                      ) : hasRecgov && currentDates.startDate ? (
                        <button
                          onClick={handleCheckAvailability}
                          className="text-[10px] bg-green-600/15 hover:bg-green-600/25 text-green-400 px-2 py-0.5 rounded-md font-semibold transition-colors border border-green-600/20"
                        >
                          Check availability
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Slim progress bar while checking */}
                  {availChecking && (
                    <div className="h-0.5 bg-stone-800 overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-600 to-green-400 transition-all duration-500 ease-out"
                        style={{
                          width: availProgress.total > 0
                            ? `${Math.max(5, (availProgress.done / availProgress.total) * 100)}%`
                            : '5%',
                        }}
                      />
                    </div>
                  )}
                </>
              )}

              <CampgroundList
                campgrounds={displayedCampgrounds}
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
            </>
          )}

          {tab === 'dispersed' && (
            <DispersedPanel
              searchLat={searchLat}
              searchLng={searchLng}
              searchRadius={searchRadius}
              searchKey={searchKey}
              vehicleType={lastVehicleType}
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

        <button
          onClick={() => setSidebarOpen((o) => !o)}
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center w-5 h-12 bg-stone-800/90 hover:bg-stone-700 border-y border-r border-stone-600/60 rounded-r-lg text-stone-400 hover:text-white transition-colors shadow-lg"
        >
          <Icon name={sidebarOpen ? 'chevronLeft' : 'chevronRight'} className="w-3 h-3" />
        </button>

        <CampgroundMap
          campgrounds={displayedCampgrounds}
          center={mapCenter}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setTab('search'); setSidebarOpen(true) }}
          dispersedSpots={dispersedSpots}
          publicLandPolygons={publicLandPolygons}
          selectedDispersedId={selectedDispersedId}
          onSelectDispersed={(id) => { setSelectedDispersedId(id); setTab('dispersed'); setSidebarOpen(true) }}
          savedCampgrounds={showSaved ? savedCampgrounds : []}
          showSaved={showSaved}
          onToggleSaved={() => setShowSaved((s) => !s)}
          onSearchArea={handleSearchArea}
          onCenterChange={(lat, lng) => setMapViewCenter({ lat, lng })}
          hasSearched={hasSearched}
        />
      </main>

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
