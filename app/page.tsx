'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Icon from '@/components/Icon'
import { loadCampgrounds } from '@/lib/dataset'
import { checkCampgroundAvailability } from '@/lib/availabilityClient'
import { listSaved, saveCampground, removeSaved, type SavedSite } from '@/lib/store'
import { STATUS_COLORS } from '@/lib/basemap'
import type { Campground, PinStatus } from '@/lib/types'
import type { MapBounds } from '@/components/MapView'

const MapView = dynamic(() => import('@/components/MapView'), {
  ssr: false,
  loading: () => <div className="absolute inset-0 grid place-items-center bg-stone-200 text-stone-500 text-sm">Loading map…</div>,
})

function nextWeekendDefaults() {
  const now = new Date()
  const day = now.getDay()
  const toFri = day <= 5 ? (5 - day || 7) : 6
  const fri = new Date(now); fri.setDate(now.getDate() + toFri)
  const sun = new Date(fri); sun.setDate(fri.getDate() + 2)
  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { start: fmt(fri), end: fmt(sun) }
}

async function runWithLimit<T>(items: T[], limit: number, fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) { const idx = i++; await fn(items[idx]) }
    }),
  )
}

function pinStatus(c: Campground): PinStatus {
  if (c.reserveType === 'first-come') return 'first-come'
  return (c.availability as PinStatus) ?? 'unknown'
}

const STATUS_LABEL: Record<PinStatus, string> = {
  available: 'Available', limited: 'Limited', full: 'Full',
  'first-come': 'First-come, first-served', unknown: 'Not checked',
}

export default function HomePage() {
  const [campgrounds, setCampgrounds] = useState<Campground[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null)
  const [bounds, setBounds] = useState<MapBounds | null>(null)
  const [dates, setDates] = useState(nextWeekendDefaults)
  const [query, setQuery] = useState('')
  const [checking, setChecking] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saved, setSaved] = useState<SavedSite[]>([])
  const [showSaved, setShowSaved] = useState(true)

  useEffect(() => {
    loadCampgrounds().then(setCampgrounds).catch((e) => setLoadError(e.message))
    listSaved().then(setSaved)
  }, [])

  const savedIds = useMemo(() => new Set(saved.map((s) => s.id)), [saved])
  const selected = useMemo(() => campgrounds.find((c) => c.id === selectedId) || null, [campgrounds, selectedId])

  const inView = useCallback((c: Campground) => !bounds
    || (c.lat >= bounds.south && c.lat <= bounds.north && c.lng >= bounds.west && c.lng <= bounds.east), [bounds])

  const toCheck = useMemo(
    () => campgrounds.filter((c) => c.reserveType === 'reservable' && inView(c)).slice(0, 60),
    [campgrounds, inView],
  )

  const onSearch = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`)
      if (!res.ok) return
      const g = await res.json()
      setCenter({ lat: g.lat, lng: g.lng })
    } catch { /* ignore */ }
  }, [query])

  const checkAvailability = useCallback(async () => {
    const start = new Date(`${dates.start}T00:00:00Z`)
    const end = new Date(`${dates.end}T00:00:00Z`)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return
    if (toCheck.length === 0) return
    setChecking(true)
    setProgress({ done: 0, total: toCheck.length })
    await runWithLimit(toCheck, 6, async (c) => {
      try {
        const r = await checkCampgroundAvailability(c.id, start, end)
        setCampgrounds((prev) => prev.map((x) => x.id === c.id
          ? { ...x, availability: r.status, availableSites: r.availableSites, totalSites: r.totalSites } : x))
      } catch { /* leave unknown */ }
      finally { setProgress((p) => ({ ...p, done: p.done + 1 })) }
    })
    setChecking(false)
  }, [dates, toCheck])

  const toggleSave = useCallback(async (c: Campground) => {
    if (savedIds.has(c.id)) await removeSaved(c.id)
    else await saveCampground(c)
    setSaved(await listSaved())
  }, [savedIds])

  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView
        campgrounds={campgrounds}
        selectedId={selectedId}
        onSelect={setSelectedId}
        center={center}
        savedSites={saved}
        showSaved={showSaved}
        onBoundsChange={setBounds}
      />

      {/* ── Top-left: brand + search ── */}
      <div className="absolute top-3 left-3 z-10 w-[330px] max-w-[calc(100vw-24px)]">
        <div className="bg-stone-900/95 backdrop-blur rounded-2xl shadow-2xl border border-stone-700/50 overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-2.5 border-b border-stone-800">
            <Icon name="tent" className="w-5 h-5 text-green-500" />
            <div>
              <h1 className="text-sm font-bold text-white leading-tight">Colorado Camp Finder</h1>
              <p className="text-[10px] text-stone-500">{campgrounds.length} campgrounds · rec.gov + CO State Parks</p>
            </div>
          </div>

          <form onSubmit={onSearch} className="p-3 space-y-2.5">
            <div className="relative">
              <Icon name="search" className="w-3.5 h-3.5 text-stone-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a town, park, or area…"
                className="w-full bg-stone-800 text-stone-100 text-sm rounded-lg pl-9 pr-3 py-2 placeholder:text-stone-500 outline-none focus:ring-2 focus:ring-green-600/40"
              />
            </div>
            <div className="flex gap-2">
              <label className="flex-1 text-[10px] text-stone-500">
                Check-in
                <input type="date" value={dates.start} onChange={(e) => setDates((d) => ({ ...d, start: e.target.value }))}
                  className="w-full mt-0.5 bg-stone-800 text-stone-100 text-xs rounded-md px-2 py-1.5 outline-none focus:ring-2 focus:ring-green-600/40" />
              </label>
              <label className="flex-1 text-[10px] text-stone-500">
                Check-out
                <input type="date" value={dates.end} onChange={(e) => setDates((d) => ({ ...d, end: e.target.value }))}
                  className="w-full mt-0.5 bg-stone-800 text-stone-100 text-xs rounded-md px-2 py-1.5 outline-none focus:ring-2 focus:ring-green-600/40" />
              </label>
            </div>
            <button
              type="button" onClick={checkAvailability} disabled={checking || toCheck.length === 0}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:bg-stone-700 disabled:text-stone-500 text-white text-sm font-semibold rounded-lg py-2 transition-colors"
            >
              {checking
                ? <>Checking {progress.done}/{progress.total}…</>
                : <><Icon name="calendar" className="w-3.5 h-3.5" /> Check availability ({toCheck.length} in view)</>}
            </button>
          </form>
        </div>
        {loadError && <p className="mt-2 text-xs text-red-400 bg-stone-900/90 rounded-lg px-3 py-2">{loadError}</p>}
      </div>

      {/* ── Top-right cluster sits under map controls: saved toggle ── */}
      <button
        onClick={() => setShowSaved((s) => !s)}
        title={showSaved ? 'Hide saved' : 'Show saved'}
        className={`absolute top-3 right-[58px] z-10 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold shadow-lg backdrop-blur border transition-colors ${
          showSaved ? 'bg-amber-600/90 text-white border-amber-400/50' : 'bg-stone-900/90 text-stone-400 border-stone-700/50'
        }`}
      >
        <Icon name={showSaved ? 'bookmarkFilled' : 'bookmark'} className="w-3.5 h-3.5" />
        {saved.length}
      </button>

      {/* ── Legend ── */}
      <div className="absolute bottom-8 right-3 z-10 bg-stone-900/90 backdrop-blur rounded-xl border border-stone-700/50 p-3 shadow-xl">
        <div className="text-[10px] font-bold text-stone-500 uppercase tracking-widest mb-1.5">Availability</div>
        {(['available', 'limited', 'full', 'first-come', 'unknown'] as PinStatus[]).map((s) => (
          <div key={s} className="flex items-center gap-2 mb-1 last:mb-0">
            <span className="w-3 h-3 rounded-full border border-white/40" style={{ background: STATUS_COLORS[s] }} />
            <span className="text-[11px] text-stone-300">{STATUS_LABEL[s]}</span>
          </div>
        ))}
      </div>

      {/* ── Detail card ── */}
      {selected && (
        <DetailCard
          c={selected}
          isSaved={savedIds.has(selected.id)}
          onClose={() => setSelectedId(null)}
          onToggleSave={() => toggleSave(selected)}
        />
      )}
    </div>
  )
}

function DetailCard({ c, isSaved, onClose, onToggleSave }: {
  c: Campground; isSaved: boolean; onClose: () => void; onToggleSave: () => void
}) {
  const status = pinStatus(c)
  return (
    <div className="absolute bottom-3 left-3 z-10 w-[340px] max-w-[calc(100vw-24px)] bg-stone-900/97 backdrop-blur rounded-2xl shadow-2xl border border-stone-700/50 overflow-hidden">
      {c.photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.photo} alt={c.name} className="w-full h-32 object-cover" />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-base font-bold text-white leading-tight">{c.name}</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-300 flex-shrink-0"><Icon name="x" className="w-4 h-4" /></button>
        </div>
        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold text-white"
            style={{ background: STATUS_COLORS[status] }}>
            {STATUS_LABEL[status]}{status !== 'first-come' && status !== 'unknown' ? ` · ${c.availableSites}/${c.totalSites}` : ''}
          </span>
          {c.campgroundType && <span className="text-[11px] text-stone-400">{c.campgroundType}</span>}
        </div>

        {c.amenities.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {c.amenities.slice(0, 6).map((a) => (
              <span key={a} className="text-[10px] text-stone-300 bg-stone-800 rounded px-1.5 py-0.5">{a}</span>
            ))}
          </div>
        )}

        {c.phone && <p className="mt-2.5 text-xs text-stone-400">{c.phone}</p>}

        <div className="mt-3 flex gap-2">
          <a href={c.reserveUrl} target="_blank" rel="noopener noreferrer"
            className="flex-1 text-center bg-green-600 hover:bg-green-500 text-white text-sm font-semibold rounded-lg py-2 transition-colors">
            Go to site →
          </a>
          <a href={c.directionsUrl} target="_blank" rel="noopener noreferrer"
            title="Directions"
            className="px-3 grid place-items-center bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg transition-colors">
            <Icon name="navigation" className="w-4 h-4" />
          </a>
          <button onClick={onToggleSave} title={isSaved ? 'Remove from saved' : 'Save'}
            className={`px-3 grid place-items-center rounded-lg transition-colors ${
              isSaved ? 'bg-amber-600 hover:bg-amber-500 text-white' : 'bg-stone-800 hover:bg-stone-700 text-stone-200'
            }`}>
            <Icon name={isSaved ? 'bookmarkFilled' : 'bookmark'} className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
