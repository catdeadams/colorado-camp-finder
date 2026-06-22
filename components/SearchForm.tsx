'use client'

import { useState, FormEvent } from 'react'
import SourceFilter from './SourceFilter'
import { ALL_SOURCES } from '@/lib/types'
import type { SearchParams, SourceKey } from '@/lib/types'

interface Props {
  onSearch: (params: SearchParams) => void
  loading: boolean
}

const VEHICLE_OPTIONS = [
  { value: 'car' as const,  label: '2WD',  sub: 'Paved & gravel' },
  { value: 'awd' as const,  label: 'AWD',  sub: 'Most dirt roads' },
  { value: '4wd' as const,  label: '4WD',  sub: 'All terrain' },
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

type GpsState = 'idle' | 'loading' | 'error'

export default function SearchForm({ onSearch, loading }: Props) {
  const defaults = nextWeekend()
  const [query, setQuery] = useState('')
  const [startDate, setStartDate] = useState(defaults.startDate)
  const [endDate, setEndDate] = useState(defaults.endDate)
  const [radiusMiles, setRadiusMiles] = useState(50)
  const [vehicleType, setVehicleType] = useState<'car' | 'awd' | '4wd'>('awd')
  const [enabledSources, setEnabledSources] = useState<SourceKey[]>([...ALL_SOURCES])
  const [gpsState, setGpsState] = useState<GpsState>('idle')
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lng: number } | null>(null)

  const today = new Date().toISOString().split('T')[0]

  function handleStartDateChange(val: string) {
    setStartDate(val)
    if (endDate && val >= endDate) {
      const next = new Date(val)
      next.setDate(next.getDate() + 1)
      setEndDate(next.toISOString().split('T')[0])
    }
  }

  function handleQueryChange(val: string) {
    setQuery(val)
    if (gpsCoords) setGpsCoords(null)  // clear GPS if user types manually
  }

  async function handleGps() {
    if (!('geolocation' in navigator)) return
    setGpsState('loading')

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        try {
          // Reverse geocode to get a human-readable name
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10`,
            { headers: { 'Accept-Language': 'en' } }
          )
          const data = await res.json()
          const addr = data.address ?? {}
          const place =
            addr.city ?? addr.town ?? addr.village ?? addr.county ?? addr.state ?? 'Your Location'
          setQuery(place)
          setGpsCoords({ lat, lng })
          setGpsState('idle')
        } catch {
          setQuery('Your Location')
          setGpsCoords({ lat, lng })
          setGpsState('idle')
        }
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
    if (!query.trim()) return
    onSearch({
      query,
      startDate,
      endDate,
      radiusMiles,
      vehicleType,
      enabledSources,
      ...(gpsCoords ? { gpsLat: gpsCoords.lat, gpsLng: gpsCoords.lng } : {}),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Location */}
      <div>
        <label className="block text-xs font-medium text-stone-400 mb-1.5">Location</label>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Denver, Breckenridge, Rocky Mountain NP..."
            className="flex-1 px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-white placeholder-stone-500 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/20 transition-colors"
            required
          />
          <button
            type="button"
            onClick={handleGps}
            disabled={gpsState === 'loading'}
            title={
              gpsState === 'error' ? 'Location access denied' :
              gpsState === 'loading' ? 'Getting location...' :
              gpsCoords ? 'GPS location set' : 'Use my location'
            }
            className={`flex-shrink-0 w-9 h-9 rounded-lg border flex items-center justify-center text-base transition-colors ${
              gpsState === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : gpsCoords
                  ? 'bg-green-600/20 border-green-500/40 text-green-400'
                  : 'bg-stone-800 border-stone-700 text-stone-400 hover:border-stone-500 hover:text-stone-300'
            }`}
          >
            {gpsState === 'loading' ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : gpsState === 'error' ? '✕' : gpsCoords ? '📍' : '🎯'}
          </button>
        </div>
        {gpsCoords && (
          <p className="text-[10px] text-green-500/70 mt-1 ml-0.5">
            📍 Using GPS coordinates — search will use your exact location
          </p>
        )}
        {gpsState === 'error' && (
          <p className="text-[10px] text-red-400/70 mt-1 ml-0.5">
            Location access denied — enable in browser settings
          </p>
        )}
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-medium text-stone-400 mb-1.5">Check-in</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => handleStartDateChange(e.target.value)}
            min={today}
            className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/20 transition-colors [color-scheme:dark]"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-400 mb-1.5">Check-out</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate || today}
            className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-white text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/20 transition-colors [color-scheme:dark]"
          />
        </div>
      </div>

      {/* Radius */}
      <div>
        <label className="block text-xs font-medium text-stone-400 mb-1.5">
          Radius: <span className="text-white font-bold">{radiusMiles} miles</span>
        </label>
        <input
          type="range"
          min={10}
          max={150}
          step={10}
          value={radiusMiles}
          onChange={(e) => setRadiusMiles(Number(e.target.value))}
          className="w-full h-1.5 accent-green-500"
        />
        <div className="flex justify-between text-xs text-stone-600 mt-0.5">
          <span>10 mi</span>
          <span>150 mi</span>
        </div>
      </div>

      {/* Vehicle */}
      <div>
        <label className="block text-xs font-medium text-stone-400 mb-1.5">Vehicle access</label>
        <div className="grid grid-cols-3 gap-1.5">
          {VEHICLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setVehicleType(opt.value)}
              className={`p-2 rounded-lg border text-left transition-all ${
                vehicleType === opt.value
                  ? 'bg-green-600/20 border-green-500 text-white'
                  : 'bg-stone-800/50 border-stone-700 text-stone-400 hover:border-stone-500'
              }`}
            >
              <div className="text-xs font-bold">{opt.label}</div>
              <div className="text-[10px] mt-0.5 opacity-70">{opt.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Source filter */}
      <SourceFilter enabled={enabledSources} onChange={setEnabledSources} />

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || !query.trim()}
        className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all flex items-center justify-center gap-2
          bg-green-600 hover:bg-green-500 text-white
          disabled:bg-stone-800 disabled:text-stone-600 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Searching {enabledSources.length} sources...
          </>
        ) : (
          `Search ${enabledSources.length} source${enabledSources.length !== 1 ? 's' : ''}`
        )}
      </button>
    </form>
  )
}
