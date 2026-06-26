'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import dynamic from 'next/dynamic'
import Icon from '@/components/Icon'
import { loadCampgrounds } from '@/lib/dataset'
import { checkCampgroundAvailability } from '@/lib/availabilityClient'
import { listSaved, saveCampground, saveCustomPin, removeSaved, exportSaved, importSaved, type SavedSite } from '@/lib/store'
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
  const [panelOpen, setPanelOpen] = useState(false)
  const [dropMode, setDropMode] = useState(false)
  const [pinDraft, setPinDraft] = useState<{ lat: number; lng: number } | null>(null)
  const [layersOpen, setLayersOpen] = useState(false)
  const [showPublicLand, setShowPublicLand] = useState(false)
  const [showRoads, setShowRoads] = useState(false)
  const [showHillshade, setShowHillshade] = useState(true)

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

  const refreshSaved = useCallback(async () => setSaved(await listSaved()), [])

  const toggleSave = useCallback(async (c: Campground) => {
    if (savedIds.has(c.id)) await removeSaved(c.id)
    else await saveCampground(c)
    await refreshSaved()
  }, [savedIds, refreshSaved])

  const onMapPoint = useCallback((lat: number, lng: number) => setPinDraft({ lat, lng }), [])

  const savePin = useCallback(async (name: string) => {
    if (!pinDraft) return
    await saveCustomPin({ name: name.trim() || 'Dispersed campsite', lat: pinDraft.lat, lng: pinDraft.lng })
    setPinDraft(null); setDropMode(false)
    await refreshSaved()
  }, [pinDraft, refreshSaved])

  const removeSavedItem = useCallback(async (id: string) => { await removeSaved(id); await refreshSaved() }, [refreshSaved])

  const doExport = useCallback(async () => {
    const blob = new Blob([await exportSaved()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'colorado-camp-saved.json'; a.click()
    URL.revokeObjectURL(url)
  }, [])

  const doImport = useCallback(async (file: File) => {
    try { await importSaved(await file.text()); await refreshSaved() } catch { /* ignore bad file */ }
  }, [refreshSaved])

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
        dropMode={dropMode}
        onMapPoint={onMapPoint}
        showPublicLand={showPublicLand}
        showRoads={showRoads}
        showHillshade={showHillshade}
      />

      {dropMode && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-orange-600 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl">
          <Icon name="mapPin" className="w-3.5 h-3.5" />
          Tap the map to place your dispersed campsite
          <button onClick={() => setDropMode(false)} className="underline opacity-90 hover:opacity-100">cancel</button>
        </div>
      )}

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
          <div className="px-3 pb-3">
            <button
              onClick={() => { setDropMode((d) => !d); setPanelOpen(false) }}
              className={`w-full flex items-center justify-center gap-2 text-sm font-semibold rounded-lg py-2 transition-colors border ${
                dropMode ? 'bg-orange-600 text-white border-orange-400' : 'bg-stone-800 hover:bg-stone-700 text-orange-300 border-stone-700'
              }`}
            >
              <Icon name="mapPin" className="w-3.5 h-3.5" />
              {dropMode ? 'Tap the map to place…' : 'Drop a dispersed pin'}
            </button>
          </div>
        </div>
        {loadError && <p className="mt-2 text-xs text-red-400 bg-stone-900/90 rounded-lg px-3 py-2">{loadError}</p>}

        {/* Dispersed layers control */}
        <div className="mt-2 bg-stone-900/95 backdrop-blur rounded-2xl shadow-2xl border border-stone-700/50 overflow-hidden">
          <button onClick={() => setLayersOpen((o) => !o)} className="w-full px-4 py-2.5 flex items-center justify-between text-left">
            <span className="text-xs font-bold text-white flex items-center gap-2"><Icon name="trees" className="w-4 h-4 text-green-500" /> Dispersed layers</span>
            <Icon name={layersOpen ? 'chevronUp' : 'chevronDown'} className="w-3.5 h-3.5 text-stone-500" />
          </button>
          {layersOpen && (
            <div className="px-4 pb-3">
              <LayerToggle label="Public land" color="#15803d" checked={showPublicLand} onChange={() => setShowPublicLand((v) => !v)} />
              <LayerToggle label="Forest roads (MVUM)" color="#16a34a" checked={showRoads} onChange={() => setShowRoads((v) => !v)} />
              <LayerToggle label="Hillshade (terrain)" color="#a8a29e" checked={showHillshade} onChange={() => setShowHillshade((v) => !v)} />
              {showRoads && (
                <div className="mt-1.5 text-[10px] text-stone-400 flex items-center gap-2.5 flex-wrap">
                  <span className="text-stone-500">Road = terrain:</span>
                  <span><span style={{ color: '#16a34a' }}>●</span> flat</span>
                  <span><span style={{ color: '#84cc16' }}>●</span> gentle</span>
                  <span><span style={{ color: '#f59e0b' }}>●</span> mod</span>
                  <span><span style={{ color: '#dc2626' }}>●</span> steep</span>
                </div>
              )}
              {(showPublicLand || showRoads || showHillshade) && (
                <p className="mt-2 pt-2 border-t border-stone-700/60 text-[10px] text-stone-500 leading-snug">
                  Greener roads = flatter ground (better for camping); tap a road for access &amp; slope. Roads ≈ legal dispersed corridors — still verify access, legality, closures &amp; fire bans on-site.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Top-right cluster sits under map controls: saved toggle ── */}
      <button
        onClick={() => setPanelOpen((o) => !o)}
        title="Saved sites"
        className={`absolute top-3 right-[58px] z-10 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold shadow-lg backdrop-blur border transition-colors ${
          panelOpen ? 'bg-amber-600/90 text-white border-amber-400/50' : 'bg-stone-900/90 text-stone-300 border-stone-700/50'
        }`}
      >
        <Icon name="bookmarkFilled" className="w-3.5 h-3.5" />
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

      {panelOpen && (
        <SavedPanel
          saved={saved}
          showSaved={showSaved}
          onToggleShow={() => setShowSaved((s) => !s)}
          onClose={() => setPanelOpen(false)}
          onFly={(s) => { setCenter({ lat: s.lat, lng: s.lng }); setPanelOpen(false) }}
          onRemove={removeSavedItem}
          onExport={doExport}
          onImport={doImport}
        />
      )}

      {pinDraft && <PinModal onCancel={() => setPinDraft(null)} onSave={savePin} />}
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

function SavedPanel({ saved, showSaved, onToggleShow, onClose, onFly, onRemove, onExport, onImport }: {
  saved: SavedSite[]; showSaved: boolean; onToggleShow: () => void; onClose: () => void
  onFly: (s: SavedSite) => void; onRemove: (id: string) => void; onExport: () => void; onImport: (f: File) => void
}) {
  return (
    <div className="absolute top-14 right-3 z-20 w-[320px] max-w-[calc(100vw-24px)] bg-stone-900/97 backdrop-blur rounded-2xl shadow-2xl border border-stone-700/50 overflow-hidden flex flex-col max-h-[70vh]">
      <div className="px-4 py-3 flex items-center justify-between border-b border-stone-800">
        <h2 className="text-sm font-bold text-white flex items-center gap-2"><Icon name="bookmarkFilled" className="w-4 h-4 text-amber-500" /> Saved ({saved.length})</h2>
        <button onClick={onClose} className="text-stone-500 hover:text-stone-300"><Icon name="x" className="w-4 h-4" /></button>
      </div>
      <div className="px-4 py-2 flex items-center justify-between border-b border-stone-800/60">
        <label className="flex items-center gap-2 text-xs text-stone-300 cursor-pointer">
          <input type="checkbox" checked={showSaved} onChange={onToggleShow} className="accent-amber-500" />
          Show on map
        </label>
        <div className="flex gap-2">
          <button onClick={onExport} className="text-[11px] text-stone-300 hover:text-white bg-stone-800 rounded px-2 py-1">Export</button>
          <label className="text-[11px] text-stone-300 hover:text-white bg-stone-800 rounded px-2 py-1 cursor-pointer">
            Import
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && onImport(e.target.files[0])} />
          </label>
        </div>
      </div>
      <div className="overflow-y-auto">
        {saved.length === 0 ? (
          <p className="text-xs text-stone-500 px-4 py-6 text-center">No saved sites yet. Save a campground, or drop a dispersed pin.</p>
        ) : saved.map((s) => (
          <div key={s.id} className="px-4 py-2.5 border-b border-stone-800/40 flex items-center gap-2.5 hover:bg-stone-800/40">
            <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.kind === 'dispersed' ? 'bg-orange-500' : 'bg-amber-500'}`} />
            <button onClick={() => onFly(s)} className="flex-1 text-left min-w-0">
              <div className="text-sm text-stone-100 truncate">{s.name}</div>
              <div className="text-[10px] text-stone-500">{s.kind === 'dispersed' ? 'Dispersed pin' : 'Campground'}{s.note ? ` · ${s.note}` : ''}</div>
            </button>
            <button onClick={() => onRemove(s.id)} title="Remove" className="text-stone-600 hover:text-red-400 flex-shrink-0"><Icon name="x" className="w-3.5 h-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}

function PinModal({ onCancel, onSave }: { onCancel: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-[320px] max-w-full bg-stone-900 rounded-2xl shadow-2xl border border-stone-700 p-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-1"><Icon name="mapPin" className="w-4 h-4 text-orange-500" /> Name this dispersed site</h2>
        <p className="text-[11px] text-stone-500 mb-3">Saved on your device and shown on the map.</p>
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onSave(name) }}
          placeholder="e.g. Aspen pullout off CR-7"
          className="w-full bg-stone-800 text-stone-100 text-sm rounded-lg px-3 py-2 placeholder:text-stone-500 outline-none focus:ring-2 focus:ring-orange-600/40"
        />
        <div className="mt-3 flex gap-2 justify-end">
          <button onClick={onCancel} className="text-sm text-stone-400 hover:text-stone-200 px-3 py-2">Cancel</button>
          <button onClick={() => onSave(name)} className="bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold rounded-lg px-4 py-2">Save pin</button>
        </div>
      </div>
    </div>
  )
}

function LayerToggle({ label, color, checked, onChange }: { label: string; color: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2.5 py-1.5 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-green-600" />
      <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color }} />
      <span className="text-xs text-stone-200">{label}</span>
    </label>
  )
}
