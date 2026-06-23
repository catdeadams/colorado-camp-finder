'use client'

import { useState, useEffect } from 'react'
import { saveDispersed, removeSaved, isSaved } from '@/lib/saved'
import Icon from './Icon'
import type { DispersedSpot, FlatnessRating, RoadAccessType } from '@/lib/types'

const FLATNESS_CONFIG: Record<FlatnessRating, { label: string; bar: number; color: string }> = {
  flat:     { label: 'Flat',     bar: 5, color: 'bg-green-500' },
  gentle:   { label: 'Gentle',   bar: 4, color: 'bg-green-400' },
  moderate: { label: 'Moderate', bar: 3, color: 'bg-amber-400' },
  hilly:    { label: 'Hilly',    bar: 2, color: 'bg-orange-400' },
  steep:    { label: 'Steep',    bar: 1, color: 'bg-red-400' },
  unknown:  { label: 'Unknown',  bar: 0, color: 'bg-stone-500' },
}

const ACCESS_CONFIG: Record<RoadAccessType, { label: string; icon: 'car' | 'truck' | null; color: string }> = {
  paved:    { label: 'Paved access',       icon: 'car',   color: 'text-green-400' },
  gravel:   { label: 'Gravel access',      icon: 'car',   color: 'text-amber-400' },
  '4wd':    { label: '4WD track',          icon: 'truck', color: 'text-orange-400' },
  'walk-in':{ label: 'Walk-in only',       icon: null,    color: 'text-red-400' },
  unknown:  { label: 'Access unknown',     icon: null,    color: 'text-stone-500' },
}

const LAND_BADGE: Record<string, { label: string; style: string }> = {
  BLM:     { label: 'BLM',  style: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  USFS:    { label: 'USFS', style: 'bg-green-500/20 text-green-400 border-green-500/30' },
  unknown: { label: '?',    style: 'bg-stone-700 text-stone-400 border-stone-600' },
}

interface Props {
  spot: DispersedSpot
  selected: boolean
  onSelect: () => void
}

function FlatnessBar({ rating }: { rating: FlatnessRating }) {
  const cfg = FLATNESS_CONFIG[rating]
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={`w-3 h-1.5 rounded-sm ${i <= cfg.bar ? cfg.color : 'bg-stone-700'}`} />
        ))}
      </div>
      <span className="text-[11px] text-stone-400">{cfg.label} terrain</span>
    </div>
  )
}

export default function DispersedCard({ spot, selected, onSelect }: Props) {
  const land = LAND_BADGE[spot.landType] ?? LAND_BADGE.unknown
  const access = ACCESS_CONFIG[spot.roadAccess]
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setSaved(isSaved(spot.id))
  }, [spot.id])

  function toggleSave(e: React.MouseEvent) {
    e.stopPropagation()
    if (saved) {
      removeSaved(spot.id)
      setSaved(false)
    } else {
      saveDispersed(spot)
      setSaved(true)
    }
  }

  return (
    <div
      onClick={onSelect}
      className={`group p-3 rounded-xl border cursor-pointer transition-all ${
        selected
          ? 'bg-stone-800 border-orange-500/60 ring-1 ring-orange-500/20'
          : 'bg-stone-800/60 border-stone-700/60 hover:bg-stone-800 hover:border-stone-600'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-white leading-snug flex-1">{spot.name}</h3>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={toggleSave}
            title={saved ? 'Remove from saved' : 'Save for offline'}
            className={`p-1 transition-colors ${saved ? 'text-amber-400' : 'text-stone-600 hover:text-stone-400'}`}
          >
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" strokeWidth="2" stroke="currentColor" fill={saved ? 'currentColor' : 'none'}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
            </svg>
          </button>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${land.style}`}>
            {land.label}
          </span>
        </div>
      </div>

      {/* Terrain flatness bar */}
      <div className="mb-2">
        <FlatnessBar rating={spot.flatnessRating} />
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-stone-500 mb-2">
        <span>{spot.distance.toFixed(1)} mi away</span>
        {spot.elevationFt > 0 && <span>{spot.elevationFt.toLocaleString()} ft</span>}
        {spot.acreage > 0 && <span>{spot.acreage.toLocaleString()} ac</span>}
        {spot.slopeAngle > 0 && <span className="text-stone-600">{spot.slopeAngle.toFixed(1)}° slope</span>}
      </div>

      {/* Access + flat spots */}
      <div className="flex items-center justify-between mb-2.5">
        <span className={`flex items-center gap-1 text-[11px] font-medium ${access.color}`}>
          {access.icon && <Icon name={access.icon} className="w-3 h-3" />}
          {access.label}
          {spot.nearestRoadMiles > 0 && spot.nearestRoadMiles < 99
            ? ` · ${spot.nearestRoadMiles.toFixed(1)} mi to road`
            : ''}
        </span>
        {spot.estimatedFlatSpots > 0 && (
          <span className="text-[11px] text-stone-400">
            ~{spot.estimatedFlatSpots} flat spot{spot.estimatedFlatSpots !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <a
          href={spot.directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex-1 text-center py-1.5 rounded-lg text-xs font-semibold bg-orange-600/80 hover:bg-orange-500 text-white transition-colors"
        >
          ↗ Get Directions
        </a>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="px-3 py-1.5 bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-lg text-xs font-semibold transition-colors"
        >
          Sat View
        </a>
      </div>
    </div>
  )
}
