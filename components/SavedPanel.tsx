'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSaved, removeSaved } from '@/lib/saved'
import Icon from './Icon'
import type { SavedItem } from '@/lib/saved'

function SavedCampgroundRow({ item, onRemove }: { item: SavedItem; onRemove: () => void }) {
  const c = item.campground!
  const canReserve = c.availability === 'available' || c.availability === 'limited'
  const statusColor = {
    available: 'text-green-400', limited: 'text-amber-400',
    full: 'text-red-400', unknown: 'text-stone-500',
  }[c.availability]

  return (
    <div className="p-3 rounded-xl border border-stone-700/60 bg-stone-800/60 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white leading-snug">{c.name}</p>
          <p className={`text-[11px] font-medium mt-0.5 ${statusColor}`}>
            {c.availability.charAt(0).toUpperCase() + c.availability.slice(1)}
            {c.totalSites > 0 ? ` · ${c.totalSites} sites` : ''}
            <span className="text-stone-500 font-normal"> · {c.distance.toFixed(1)} mi</span>
          </p>
        </div>
        <button
          onClick={onRemove}
          title="Remove"
          className="flex-shrink-0 text-stone-600 hover:text-red-400 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>
      <div className="flex gap-2">
        <a
          href={c.reserveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            canReserve ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-stone-700 hover:bg-stone-600 text-stone-400'
          }`}
        >
          {canReserve ? 'Reserve →' : 'View →'}
        </a>
        <a
          href={c.directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-lg text-xs font-semibold transition-colors"
        >
          ↗ Dirs
        </a>
      </div>
    </div>
  )
}

function SavedDispersedRow({ item, onRemove }: { item: SavedItem; onRemove: () => void }) {
  const s = item.dispersed!
  const landStyle = s.landType === 'BLM'
    ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    : s.landType === 'USFS'
      ? 'bg-green-500/20 text-green-400 border-green-500/30'
      : 'bg-stone-700 text-stone-400 border-stone-600'

  return (
    <div className="p-3 rounded-xl border border-stone-700/60 bg-stone-800/60 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${landStyle}`}>
              {s.landType}
            </span>
            <p className="text-sm font-semibold text-white leading-snug truncate">{s.name}</p>
          </div>
          <p className="text-[11px] text-stone-500">
            {s.flatnessRating} · {s.roadAccess} · {s.distance.toFixed(1)} mi
            {s.elevationFt > 0 ? ` · ${s.elevationFt.toLocaleString()} ft` : ''}
          </p>
        </div>
        <button
          onClick={onRemove}
          title="Remove"
          className="flex-shrink-0 text-stone-600 hover:text-red-400 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>
      <div className="flex gap-2">
        <a
          href={s.directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-center py-1.5 rounded-lg text-xs font-semibold bg-orange-600/80 hover:bg-orange-500 text-white transition-colors"
        >
          ↗ Get Directions
        </a>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-lg text-xs font-semibold transition-colors"
        >
          Sat
        </a>
      </div>
    </div>
  )
}

export default function SavedPanel() {
  const [items, setItems] = useState<SavedItem[]>([])
  const [mounted, setMounted] = useState(false)

  const refresh = useCallback(() => setItems(getSaved()), [])

  useEffect(() => {
    setMounted(true)
    refresh()
  }, [refresh])

  function handleRemove(id: string) {
    removeSaved(id)
    refresh()
  }

  if (!mounted) return null

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <Icon name="bookmark" className="w-12 h-12 mb-4 text-stone-600" />
        <p className="text-stone-300 font-semibold">No saved spots yet</p>
        <p className="text-stone-500 text-sm mt-2 leading-relaxed">
          Tap the bookmark icon on any campground or dispersed spot to save it here. Saved spots are available offline.
        </p>
      </div>
    )
  }

  const camps = items.filter((i) => i.type === 'campground')
  const dispersed = items.filter((i) => i.type === 'dispersed')

  return (
    <div className="p-3 space-y-4">
      <div className="mx-1 text-[10px] text-stone-600 bg-stone-800/30 rounded-lg px-3 py-2">
        {items.length} saved spot{items.length !== 1 ? 's' : ''} · stored on this device · available offline
      </div>

      {camps.length > 0 && (
        <section>
          <div className="flex items-center gap-2 px-1 mb-2">
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Campgrounds</span>
            <div className="flex-1 h-px bg-stone-800" />
            <span className="text-[10px] text-stone-600">{camps.length}</span>
          </div>
          <div className="space-y-2">
            {camps.map((item) => (
              <SavedCampgroundRow key={item.id} item={item} onRemove={() => handleRemove(item.id)} />
            ))}
          </div>
        </section>
      )}

      {dispersed.length > 0 && (
        <section>
          <div className="flex items-center gap-2 px-1 mb-2">
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Dispersed spots</span>
            <div className="flex-1 h-px bg-stone-800" />
            <span className="text-[10px] text-stone-600">{dispersed.length}</span>
          </div>
          <div className="space-y-2">
            {dispersed.map((item) => (
              <SavedDispersedRow key={item.id} item={item} onRemove={() => handleRemove(item.id)} />
            ))}
          </div>
        </section>
      )}

      <div className="h-4" />
    </div>
  )
}
