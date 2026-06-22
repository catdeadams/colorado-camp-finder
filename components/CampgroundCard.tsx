'use client'

import { useState, useEffect } from 'react'
import { saveCampground, removeSaved, isSaved } from '@/lib/saved'
import type { Campground } from '@/lib/types'

const STATUS = {
  available: { dot: 'bg-green-500', badge: 'bg-green-500/15 text-green-400 border-green-500/30', label: 'Available' },
  limited:   { dot: 'bg-amber-500', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/30', label: 'Limited' },
  full:      { dot: 'bg-red-500',   badge: 'bg-red-500/15 text-red-400 border-red-500/30',       label: 'Full' },
  unknown:   { dot: 'bg-stone-500', badge: 'bg-stone-700/50 text-stone-400 border-stone-600',    label: 'Unknown' },
}

const SOURCE_LABEL: Record<string, string> = {
  recgov: 'rec.gov',
  cpw: 'CO State Parks',
  freecampsites: 'Free Camping',
  thedyrt: 'The Dyrt',
  hipcamp: 'Hipcamp',
  ioverlander: 'iOverlander',
}

interface Props {
  campground: Campground
  selected: boolean
  onSelect: () => void
  onWatch?: () => void
}

export default function CampgroundCard({ campground, selected, onSelect, onWatch }: Props) {
  const s = STATUS[campground.availability]
  const canReserve = campground.availability === 'available' || campground.availability === 'limited'
  const isReservable = campground.reserveType === 'reservable'
  const isFree = campground.reserveType === 'first-come' || campground.reserveType === 'dispersed'
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setSaved(isSaved(campground.id))
  }, [campground.id])

  function toggleSave(e: React.MouseEvent) {
    e.stopPropagation()
    if (saved) {
      removeSaved(campground.id)
      setSaved(false)
    } else {
      saveCampground(campground)
      setSaved(true)
    }
  }

  return (
    <div
      onClick={onSelect}
      className={`group p-3 rounded-xl border cursor-pointer transition-all ${
        selected
          ? 'bg-stone-800 border-green-500/60 ring-1 ring-green-500/20 shadow-lg shadow-green-900/20'
          : 'bg-stone-800/60 border-stone-700/60 hover:bg-stone-800 hover:border-stone-600'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-start gap-1.5 min-w-0">
          <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
          <h3 className="text-sm font-semibold text-white leading-snug">{campground.name}</h3>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Save bookmark */}
          <button
            onClick={toggleSave}
            title={saved ? 'Remove from saved' : 'Save for offline'}
            className={`p-1 transition-colors ${saved ? 'text-amber-400' : 'text-stone-600 hover:text-stone-400'}`}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" strokeWidth="2" stroke="currentColor" fill={saved ? 'currentColor' : 'none'}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
          {/* Watch bell — only for reservable sites that are full/unknown */}
          {isReservable && !canReserve && onWatch && (
            <button
              onClick={(e) => { e.stopPropagation(); onWatch() }}
              title="Watch for availability"
              className="p-1 text-stone-500 hover:text-amber-400 transition-colors"
            >
              🔔
            </button>
          )}
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${s.badge}`}>
            {s.label}
          </span>
        </div>
      </div>

      {/* Meta */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-stone-500 mb-2 ml-3.5">
        <span>{campground.distance.toFixed(1)} mi</span>
        {campground.totalSites > 0 && (
          <span>{canReserve ? `${campground.availableSites}/` : ''}{campground.totalSites} sites</span>
        )}
        <span className="text-stone-600">{SOURCE_LABEL[campground.source] || campground.source}</span>
        {isFree && <span className="text-emerald-600 font-medium">Free</span>}
      </div>

      {/* Description */}
      {campground.description && (
        <p className="text-[11px] text-stone-500 mb-2 ml-3.5 line-clamp-2 leading-relaxed">
          {campground.description}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 ml-3.5">
        <a
          href={campground.reserveUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            canReserve
              ? 'bg-green-600 hover:bg-green-500 text-white'
              : 'bg-stone-700 hover:bg-stone-600 text-stone-400'
          }`}
        >
          {isFree ? 'View site →' : canReserve ? 'Reserve →' : 'View →'}
        </a>
        <a
          href={campground.directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          title="Get directions"
          className="px-3 py-1.5 bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-lg text-xs font-semibold transition-colors"
        >
          ↗ Dirs
        </a>
      </div>
    </div>
  )
}
