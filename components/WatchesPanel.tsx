'use client'

import { useEffect, useState, useCallback } from 'react'
import type { Watch } from '@/lib/db'

const STATUS_STYLE: Record<string, string> = {
  available: 'text-green-400',
  limited: 'text-amber-400',
  full: 'text-red-400',
  unknown: 'text-stone-500',
  skipped: 'text-stone-500',
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function WatchesPanel() {
  const [watches, setWatches] = useState<Watch[]>([])
  const [checking, setChecking] = useState(false)
  const [lastRun, setLastRun] = useState<string | null>(null)

  const loadWatches = useCallback(async () => {
    try {
      const res = await fetch('/api/watches')
      const data = await res.json()
      setWatches(data.watches || [])
    } catch {
      // silent
    }
  }, [])

  useEffect(() => {
    loadWatches()
    // Auto-check every 15 min while panel is open
    const interval = setInterval(runCheck, 15 * 60 * 1000)
    return () => clearInterval(interval)
  }, [loadWatches])

  async function runCheck() {
    setChecking(true)
    try {
      await fetch('/api/check-alerts', { method: 'POST' })
      setLastRun(new Date().toISOString())
      await loadWatches()
    } finally {
      setChecking(false)
    }
  }

  async function removeWatch(id: string) {
    await fetch(`/api/watches?id=${id}`, { method: 'DELETE' })
    setWatches((prev) => prev.filter((w) => w.id !== id))
  }

  if (watches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="text-5xl mb-4">🔔</div>
        <p className="text-stone-300 font-semibold">No active watches</p>
        <p className="text-stone-500 text-sm mt-2 leading-relaxed">
          When you find a full campground, click the bell icon to get an email when it opens up
        </p>
      </div>
    )
  }

  return (
    <div className="p-3">
      {/* Check now row */}
      <div className="flex items-center justify-between px-1 py-2 mb-2">
        <span className="text-xs text-stone-500">
          {watches.length} active watch{watches.length !== 1 ? 'es' : ''}
          {lastRun && <span className="ml-1">· checked {timeAgo(lastRun)}</span>}
        </span>
        <button
          onClick={runCheck}
          disabled={checking}
          className="text-xs text-green-400 hover:text-green-300 disabled:text-stone-600 font-medium transition-colors"
        >
          {checking ? 'Checking...' : 'Check now'}
        </button>
      </div>

      <div className="space-y-2">
        {watches.map((watch) => (
          <div key={watch.id} className="bg-stone-800/60 border border-stone-700/60 rounded-xl p-3">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div>
                <p className="text-sm font-semibold text-white leading-tight">{watch.campgroundName}</p>
                <p className="text-xs text-stone-500 mt-0.5">
                  {watch.startDate} → {watch.endDate}
                </p>
              </div>
              <button
                onClick={() => removeWatch(watch.id)}
                className="text-stone-600 hover:text-stone-400 text-lg leading-none flex-shrink-0 mt-0.5"
                title="Remove watch"
              >
                ×
              </button>
            </div>

            <div className="flex items-center justify-between text-xs mt-2">
              <div className="flex items-center gap-1.5">
                <span className="text-stone-500">Status:</span>
                <span className={`font-medium capitalize ${STATUS_STYLE[watch.lastStatus] || 'text-stone-400'}`}>
                  {watch.lastStatus}
                </span>
              </div>
              <span className="text-stone-600">
                checked {timeAgo(watch.lastCheckedAt)}
              </span>
            </div>

            {watch.notifiedAt && (
              <div className="mt-2 text-[11px] text-green-400 bg-green-500/10 rounded-lg px-2 py-1">
                ✓ Alert sent {timeAgo(watch.notifiedAt)}
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-stone-700/50">
              <span className="text-[10px] text-stone-600 flex-1 truncate">→ {watch.email}</span>
              <a
                href={watch.reserveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-stone-500 hover:text-stone-300"
              >
                View site ↗
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
