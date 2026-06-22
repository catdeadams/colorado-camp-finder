'use client'

import { useState } from 'react'
import { ALL_SOURCES, SOURCE_META } from '@/lib/types'
import type { SourceKey } from '@/lib/types'

interface Props {
  enabled: SourceKey[]
  onChange: (sources: SourceKey[]) => void
}

export default function SourceFilter({ enabled, onChange }: Props) {
  const [open, setOpen] = useState(false)

  function toggle(key: SourceKey) {
    const next = enabled.includes(key)
      ? enabled.filter((s) => s !== key)
      : [...enabled, key]
    // Always keep at least one source
    if (next.length > 0) onChange(next)
  }

  const allOn = enabled.length === ALL_SOURCES.length

  return (
    <div className="border border-stone-700/60 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 bg-stone-800/50 hover:bg-stone-800 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-stone-400">Data sources</span>
          {!allOn && (
            <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-full">
              {enabled.length}/{ALL_SOURCES.length}
            </span>
          )}
        </div>
        <span className="text-stone-600 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="divide-y divide-stone-800">
          {ALL_SOURCES.map((key) => {
            const meta = SOURCE_META[key]
            const on = enabled.includes(key)
            return (
              <label
                key={key}
                className={`flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                  on ? 'bg-stone-800/30' : 'bg-stone-900/30 opacity-60'
                } hover:bg-stone-800/50`}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(key)}
                  className="mt-0.5 accent-green-500 flex-shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-stone-300 leading-tight">{meta.label}</div>
                  <div className="text-[10px] text-stone-500 mt-0.5">{meta.description}</div>
                </div>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
