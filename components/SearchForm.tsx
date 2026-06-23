'use client'

import { useState, FormEvent } from 'react'
import Icon from './Icon'
import SourceFilter from './SourceFilter'
import { ALL_SOURCES } from '@/lib/types'
import type { SearchParams, SourceKey, DateMode, AmenityFilter } from '@/lib/types'

interface Props {
  onSearch: (params: SearchParams) => void
  loading: boolean
}

const VEHICLE_OPTIONS = [
  { value: 'car' as const,  label: '2WD',  sub: 'Paved roads' },
  { value: 'awd' as const,  label: 'AWD',  sub: 'Gravel & dirt' },
  { value: '4wd' as const,  label: '4WD',  sub: 'All terrain' },
]

const AMENITY_OPTIONS: { key: AmenityFilter; label: string; icon: React.ReactNode }[] = [
  { key: 'waterfront',   label: 'Waterfront',    icon: <Icon name="waves"    className="w-3.5 h-3.5" /> },
  { key: 'restrooms',    label: 'Restrooms',     icon: <Icon name="building" className="w-3.5 h-3.5" /> },
  { key: 'drinkingWater',label: 'Drinking water',icon: <Icon name="droplets" className="w-3.5 h-3.5" /> },
  { key: 'hookups',      label: 'Hookups',       icon: <Icon name="zap"      className="w-3.5 h-3.5" /> },
  { key: 'pets',         label: 'Pet friendly',  icon: <Icon name="paw"      className="w-3.5 h-3.5" /> },
  { key: 'nearTown',     label: 'Near a town',   icon: <Icon name="home"     className="w-3.5 h-3.5" /> },
]

function nextWeekend() {
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

function addWeeks(base: string, weeks: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().split('T')[0]
}

type GpsState = 'idle' | 'loading' | 'error'

export default function SearchForm({ onSearch, loading }: Props) {
  const defaults = nextWeekend()
  const today = new Date().toISOString().split('T')[0]

  const [query, setQuery] = useState('')
  const [dateMode, setDateMode] = useState<DateMode>('exact')
  const [startDate, setStartDate] = useState(defaults.startDate)
  const [endDate, setEndDate] = useState(defaults.endDate)
  const [windowStart, setWindowStart] = useState(today)
  const [windowEnd, setWindowEnd] = useState(addWeeks(today, 6))
  const [tripNights, setTripNights] = useState(2)
  const [radiusMiles, setRadiusMiles] = useState(50)
  const [vehicleType, setVehicleType] = useState<'car' | 'awd' | '4wd'>('awd')
  const [enabledSources, setEnabledSources] = useState<SourceKey[]>([...ALL_SOURCES])
  const [amenities, setAmenities] = useState<AmenityFilter[]>([])
  const [showAmenities, setShowAmenities] = useState(false)
  const [gpsState, setGpsState] = useState<GpsState>('idle')
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)

  function toggleAmenity(key: AmenityFilter) {
    setAmenities((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  function handleQueryChange(val: string) {
    setQuery(val)
    if (gpsCoords) setGpsCoords(null)
  }

  function handleStartDateChange(val: string) {
    setStartDate(val)
    if (endDate && val >= endDate) {
      const next = new Date(val)
      next.setDate(next.getDate() + 1)
      setEndDate(next.toISOString().split('T')[0])
    }
  }

  async function handleGps() {
    if (!('geolocation' in navigator)) return
    setGpsState('loading')
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
            { headers: { 'Accept-Language': 'en' } }
          )
          const data = await res.json()
          const addr = data.address ?? {}
          const place = addr.city ?? addr.town ?? addr.village ?? addr.county ?? addr.state ?? 'My Location'
          setQuery(place)
          setGpsCoords({ lat, lng })
        } catch {
          setQuery('My Location')
          setGpsCoords({ lat, lng })
        }
        setGpsState('idle')
      },
      () => {
        setGpsState('error')
        setTimeout(() => setGpsState('idle'), 3000)
      },
      { timeout: 10000, maximumAge: 60000 }
    )
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    onSearch({
      query,
      startDate,
      endDate,
      dateMode,
      windowStart,
      windowEnd,
      tripNights,
      radiusMiles,
      vehicleType,
      enabledSources,
      amenities,
      ...(gpsCoords ? { gpsLat: gpsCoords.lat, gpsLng: gpsCoords.lng } : {}),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Location */}
      <div>
        <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">
          Location
        </label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Denver, Breckenridge, Rocky Mountain NP…"
            className="flex-1 px-3 py-2 bg-stone-800/80 border border-stone-700 rounded-lg text-white placeholder-stone-600 text-sm focus:outline-none focus:border-stone-500 focus:ring-1 focus:ring-stone-500/20 transition-colors"
          />
          <button
            type="button"
            onClick={handleGps}
            disabled={gpsState === 'loading'}
            title={
              gpsState === 'error'   ? 'Location access denied' :
              gpsState === 'loading' ? 'Getting location…' :
              gpsCoords              ? 'Using GPS location' : 'Use my location'
            }
            className={`flex-shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center transition-colors ${
              gpsState === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : gpsCoords
                  ? 'bg-green-600/15 border-green-500/30 text-green-400'
                  : 'bg-stone-800 border-stone-700 text-stone-500 hover:border-stone-600 hover:text-stone-300'
            }`}
          >
            {gpsState === 'loading' ? (
              <Icon name="refresh" className="w-4 h-4 animate-spin" />
            ) : gpsState === 'error' ? (
              <Icon name="x" className="w-4 h-4" />
            ) : gpsCoords ? (
              <Icon name="mapPin" className="w-4 h-4" />
            ) : (
              <Icon name="crosshair" className="w-4 h-4" />
            )}
          </button>
        </div>
        {gpsCoords && (
          <p className="text-[10px] text-green-500/70 mt-1 flex items-center gap-1">
            <Icon name="mapPin" className="w-3 h-3" />
            Using GPS — search will use your exact position
          </p>
        )}
        {gpsState === 'error' && (
          <p className="text-[10px] text-red-400/70 mt-1">Location access denied — enable in browser settings</p>
        )}
      </div>

      {/* Date mode toggle */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Dates</label>
          <div className="flex rounded-lg overflow-hidden border border-stone-700 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setDateMode('exact')}
              className={`px-2.5 py-1 transition-colors ${
                dateMode === 'exact' ? 'bg-stone-700 text-white' : 'text-stone-500 hover:text-stone-300'
              }`}
            >
              Exact
            </button>
            <button
              type="button"
              onClick={() => setDateMode('flexible')}
              className={`px-2.5 py-1 transition-colors border-l border-stone-700 ${
                dateMode === 'flexible' ? 'bg-stone-700 text-white' : 'text-stone-500 hover:text-stone-300'
              }`}
            >
              Flexible
            </button>
          </div>
        </div>

        {dateMode === 'exact' ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-stone-500 mb-1">Check-in</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleStartDateChange(e.target.value)}
                min={today}
                className="w-full px-3 py-2 bg-stone-800/80 border border-stone-700 rounded-lg text-white text-sm focus:outline-none focus:border-stone-500 transition-colors [color-scheme:dark]"
              />
            </div>
            <div>
              <label className="block text-[10px] text-stone-500 mb-1">Check-out</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate || today}
                className="w-full px-3 py-2 bg-stone-800/80 border border-stone-700 rounded-lg text-white text-sm focus:outline-none focus:border-stone-500 transition-colors [color-scheme:dark]"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] text-stone-500">
              Find campgrounds with any availability in your window
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-stone-500 mb-1">Window start</label>
                <input
                  type="date"
                  value={windowStart}
                  onChange={(e) => setWindowStart(e.target.value)}
                  min={today}
                  className="w-full px-3 py-2 bg-stone-800/80 border border-stone-700 rounded-lg text-white text-sm focus:outline-none focus:border-stone-500 transition-colors [color-scheme:dark]"
                />
              </div>
              <div>
                <label className="block text-[10px] text-stone-500 mb-1">Window end</label>
                <input
                  type="date"
                  value={windowEnd}
                  onChange={(e) => setWindowEnd(e.target.value)}
                  min={windowStart || today}
                  className="w-full px-3 py-2 bg-stone-800/80 border border-stone-700 rounded-lg text-white text-sm focus:outline-none focus:border-stone-500 transition-colors [color-scheme:dark]"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-stone-500 whitespace-nowrap">Min stay:</label>
              <select
                value={tripNights}
                onChange={(e) => setTripNights(Number(e.target.value))}
                className="flex-1 px-2 py-1.5 bg-stone-800 border border-stone-700 rounded-lg text-white text-xs focus:outline-none focus:border-stone-500 transition-colors"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <option key={n} value={n}>{n} night{n !== 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Radius */}
      <div>
        <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">
          Radius — <span className="text-white font-bold normal-case">{radiusMiles} miles</span>
        </label>
        <input
          type="range"
          min={10}
          max={150}
          step={10}
          value={radiusMiles}
          onChange={(e) => setRadiusMiles(Number(e.target.value))}
          className="w-full h-1.5 accent-stone-400"
        />
        <div className="flex justify-between text-[10px] text-stone-600 mt-0.5">
          <span>10 mi</span>
          <span>150 mi</span>
        </div>
      </div>

      {/* Vehicle */}
      <div>
        <label className="block text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">
          Vehicle access
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {VEHICLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setVehicleType(opt.value)}
              className={`p-2 rounded-lg border text-left transition-all ${
                vehicleType === opt.value
                  ? 'bg-stone-700 border-stone-500 text-white'
                  : 'bg-stone-800/50 border-stone-700/60 text-stone-400 hover:border-stone-600'
              }`}
            >
              <div className="text-xs font-bold">{opt.label}</div>
              <div className="text-[10px] mt-0.5 opacity-60">{opt.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Amenity filter */}
      <div>
        <button
          type="button"
          onClick={() => setShowAmenities(!showAmenities)}
          className="flex items-center justify-between w-full text-[11px] font-semibold text-stone-400 uppercase tracking-wider"
        >
          <span className="flex items-center gap-1.5">
            <Icon name="filter" className="w-3.5 h-3.5" />
            Amenities
            {amenities.length > 0 && (
              <span className="ml-1 text-[9px] bg-stone-600 text-stone-200 px-1.5 py-0.5 rounded-full font-bold normal-case">
                {amenities.length}
              </span>
            )}
          </span>
          <Icon name={showAmenities ? 'chevronUp' : 'chevronDown'} className="w-3.5 h-3.5" />
        </button>
        {showAmenities && (
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {AMENITY_OPTIONS.map(({ key, label, icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => toggleAmenity(key)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left text-xs transition-all ${
                  amenities.includes(key)
                    ? 'bg-stone-700 border-stone-500 text-white'
                    : 'bg-stone-800/50 border-stone-700/60 text-stone-400 hover:border-stone-600'
                }`}
              >
                <span className="flex-shrink-0 opacity-70">{icon}</span>
                <span className="font-medium leading-tight">{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Source filter */}
      <SourceFilter enabled={enabledSources} onChange={setEnabledSources} />

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2 bg-white hover:bg-stone-100 text-stone-900 disabled:bg-stone-800 disabled:text-stone-600 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Icon name="refresh" className="w-4 h-4 animate-spin" />
            Searching {enabledSources.length} sources…
          </>
        ) : (
          <>
            <Icon name="search" className="w-4 h-4" />
            Search {enabledSources.length} source{enabledSources.length !== 1 ? 's' : ''}
          </>
        )}
      </button>
    </form>
  )
}
