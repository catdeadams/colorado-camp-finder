import CampgroundCard from './CampgroundCard'
import Icon from './Icon'
import type { Campground } from '@/lib/types'

interface Props {
  campgrounds: Campground[]
  loading: boolean
  error: string | null
  hasSearched: boolean
  searchQuery?: string
  startDate?: string
  endDate?: string
  selectedId: string | null
  onSelect: (id: string) => void
  onWatch: (campground: Campground) => void
}

function Section({ title, items, selectedId, onSelect, onWatch }: {
  title: string
  items: Campground[]
  selectedId: string | null
  onSelect: (id: string) => void
  onWatch: (c: Campground) => void
}) {
  return (
    <section>
      <div className="flex items-center gap-2 px-1 mb-2">
        <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">{title}</span>
        <div className="flex-1 h-px bg-stone-800" />
        <span className="text-[10px] text-stone-600">{items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map((c) => (
          <CampgroundCard
            key={c.id}
            campground={c}
            selected={selectedId === c.id}
            onSelect={() => onSelect(c.id)}
            onWatch={() => onWatch(c)}
          />
        ))}
      </div>
    </section>
  )
}

function HipcampLink({ query, startDate, endDate }: { query?: string; startDate?: string; endDate?: string }) {
  const params = new URLSearchParams()
  if (query) params.set('q', query)
  if (startDate) params.set('startDate', startDate)
  if (endDate) params.set('endDate', endDate)
  const url = `https://www.hipcamp.com/en-US/search?${params}`

  return (
    <div className="mx-1 p-3 rounded-xl border border-dashed border-stone-700 bg-stone-900/40 text-center">
      <div className="text-sm font-semibold text-stone-300 mb-1">Try Hipcamp for private land stays</div>
      <p className="text-xs text-stone-500 mb-3">Farms, ranches, and unique spots not on rec.gov</p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-block px-4 py-2 bg-stone-700 hover:bg-stone-600 text-stone-300 rounded-lg text-xs font-semibold transition-colors"
      >
        Search Hipcamp →
      </a>
    </div>
  )
}

export default function CampgroundList({
  campgrounds, loading, error, hasSearched, searchQuery, startDate, endDate, selectedId, onSelect, onWatch,
}: Props) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <Icon name="tent" className="w-12 h-12 mb-4 text-stone-600 animate-bounce" />
        <p className="text-stone-300 font-semibold text-sm">Searching all sources...</p>
        <p className="text-stone-500 text-xs mt-1.5">rec.gov · CO State Parks · FreeCampsites.net</p>
        <p className="text-stone-600 text-xs mt-1">Checking availability — takes ~20 seconds</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-4 text-sm text-red-400">
          <div className="font-semibold mb-1">Search failed</div>
          <div className="text-xs text-red-400/80">{error}</div>
          {error.includes('RECGOV_API_KEY') && (
            <div className="mt-3 text-xs text-stone-400 bg-stone-800 rounded-lg p-3">
              <strong className="text-white">Setup needed:</strong> Add your free API key from{' '}
              <a href="https://ridb.recreation.gov/landing" target="_blank" rel="noopener noreferrer" className="text-green-400 underline">
                ridb.recreation.gov
              </a>{' '}
              to <code className="text-green-400">.env.local</code>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (!hasSearched) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <Icon name="mountain" className="w-14 h-14 mb-5 text-stone-600" />
        <p className="text-stone-300 font-semibold">Ready to explore Colorado</p>
        <p className="text-stone-500 text-sm mt-2 leading-relaxed">
          Search by location and dates to find campgrounds from rec.gov, Colorado State Parks, and free camping sites
        </p>
      </div>
    )
  }

  if (campgrounds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <Icon name="search" className="w-12 h-12 mb-4 text-stone-600" />
        <p className="text-stone-300 font-semibold">No campgrounds found</p>
        <p className="text-stone-500 text-sm mt-2">Try a larger search radius or different location</p>
      </div>
    )
  }

  const available = campgrounds.filter((c) => c.availability === 'available' || c.availability === 'limited')
  const full = campgrounds.filter((c) => c.availability === 'full')
  const unknown = campgrounds.filter((c) => c.availability === 'unknown')

  return (
    <div className="p-3 space-y-4">
      {available.length > 0 && (
        <Section title="Available" items={available} selectedId={selectedId} onSelect={onSelect} onWatch={onWatch} />
      )}
      {full.length > 0 && (
        <Section title="Full / Unavailable" items={full} selectedId={selectedId} onSelect={onSelect} onWatch={onWatch} />
      )}
      {unknown.length > 0 && (
        <Section title="Availability Unknown" items={unknown} selectedId={selectedId} onSelect={onSelect} onWatch={onWatch} />
      )}
      {/* Hipcamp deep link — always shown at bottom after a search */}
      <HipcampLink query={searchQuery} startDate={startDate} endDate={endDate} />

      <div className="h-4" />
    </div>
  )
}
