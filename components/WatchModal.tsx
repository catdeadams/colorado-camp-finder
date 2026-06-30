'use client'

import { useState, FormEvent } from 'react'
import type { Campground } from '@/lib/types'

interface Props {
  campground: Campground
  startDate: string
  endDate: string
  onClose: () => void
  onSaved: () => void
}

export default function WatchModal({ campground, startDate, endDate, onClose, onSaved }: Props) {
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/watches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campgroundId: campground.id,
          campgroundName: campground.name,
          campgroundSource: campground.source,
          reserveUrl: campground.reserveUrl,
          lat: campground.lat,
          lng: campground.lng,
          startDate,
          endDate,
          email,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to save watch')
      }

      setDone(true)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-stone-900 border border-stone-700 rounded-2xl w-full max-w-sm shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5">
          {done ? (
            <div className="text-center py-4">
              <div className="flex justify-center mb-3">
                <svg className="w-10 h-10 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">Watch saved!</h3>
              <p className="text-stone-400 text-sm">
                We&apos;ll email <strong className="text-white">{email}</strong> the moment a site opens up.
              </p>
              <button
                onClick={onClose}
                className="mt-5 w-full py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl font-semibold text-sm"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-white font-bold text-base leading-tight">Watch for availability</h3>
                  <p className="text-stone-500 text-xs mt-0.5">Get an email when a site opens</p>
                </div>
                <button onClick={onClose} className="text-stone-500 hover:text-white text-xl leading-none ml-2">×</button>
              </div>

              {/* Campground info */}
              <div className="bg-stone-800 rounded-xl p-3 mb-4">
                <div className="font-semibold text-white text-sm leading-tight mb-1">{campground.name}</div>
                <div className="text-stone-400 text-xs">{startDate} → {endDate}</div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-stone-400 mb-1.5">
                    Alert email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                    className="w-full px-3 py-2 bg-stone-800 border border-stone-700 rounded-lg text-white placeholder-stone-500 text-sm focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500/20"
                  />
                </div>

                {error && (
                  <p className="text-red-400 text-xs">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-stone-700 disabled:text-stone-500 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Saving...
                    </>
                  ) : (
                    'Watch this campground'
                  )}
                </button>

                <p className="text-stone-600 text-[10px] text-center">
                  We keep checking and email you the moment a site opens
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
