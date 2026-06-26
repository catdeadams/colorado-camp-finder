'use client'

import { useEffect, useState } from 'react'
import Icon from './Icon'

type State = 'idle' | 'downloading' | 'ready'

export default function OfflineButton() {
  const [state, setState] = useState<State>('idle')
  const [pct, setPct] = useState(0)
  const [label, setLabel] = useState('')

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMsg = (e: MessageEvent) => {
      const d = e.data
      if (d?.type === 'PACK_STATUS') { if (d.downloaded) setState('ready') }
      else if (d?.type === 'PACK_PROGRESS') { setState('downloading'); setPct(d.pct); setLabel(d.label || '') }
      else if (d?.type === 'PACK_DONE') { setState('ready'); setPct(100) }
      else if (d?.type === 'PACK_ERROR') { setState('idle'); setLabel('Download failed — try again') }
    }
    navigator.serviceWorker.addEventListener('message', onMsg)
    navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'PACK_STATUS' }))
    return () => navigator.serviceWorker.removeEventListener('message', onMsg)
  }, [])

  const download = () => {
    navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage({ type: 'DOWNLOAD_PACK' }))
    setState('downloading'); setPct(0); setLabel('Starting…')
  }

  return (
    <div className="mt-2 bg-stone-900/95 backdrop-blur rounded-2xl shadow-2xl border border-stone-700/50 px-4 py-3">
      {state === 'ready' ? (
        <div className="flex items-center gap-2 text-xs font-semibold text-green-400">
          <Icon name="check" className="w-4 h-4" /> Colorado saved for offline
        </div>
      ) : state === 'downloading' ? (
        <div>
          <div className="flex items-center justify-between text-[11px] text-stone-300 mb-1.5">
            <span>Saving offline… {label}</span><span className="tabular-nums">{pct}%</span>
          </div>
          <div className="h-1.5 bg-stone-800 rounded overflow-hidden">
            <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : (
        <button onClick={download} className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-stone-200 hover:text-white">
          <Icon name="chevronDown" className="w-3.5 h-3.5" /> Save Colorado for offline
          <span className="text-[10px] text-stone-500">~120 MB</span>
        </button>
      )}
    </div>
  )
}
