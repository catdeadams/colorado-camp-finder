import type { Campground, CampgroundSource } from './types'

const SOURCE_PRIORITY: Record<CampgroundSource, number> = {
  recgov:       0,
  cpw:          1,
  hipcamp:      2,
  thedyrt:      3,
  freecampsites: 4,
  ioverlander:  5,
}

// Words to strip before name comparison
const NOISE = /\b(campground|campsite|camp|site|park|area|recreation|rv|camping|state|national|forest|lake)\b/gi

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function tokenSimilarity(a: string, b: string): number {
  const clean = (s: string) =>
    new Set(
      s.toLowerCase()
        .replace(NOISE, ' ')
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(Boolean)
    )
  const tokA = clean(a)
  const tokB = clean(b)
  if (tokA.size === 0 && tokB.size === 0) return 1
  const intersection = [...tokA].filter((t) => tokB.has(t)).length
  const union = new Set([...tokA, ...tokB]).size
  return union === 0 ? 0 : intersection / union
}

export function deduplicateCampgrounds(all: Campground[]): Campground[] {
  // Higher-priority sources win
  const sorted = [...all].sort(
    (a, b) => (SOURCE_PRIORITY[a.source] ?? 99) - (SOURCE_PRIORITY[b.source] ?? 99)
  )

  const kept: Campground[] = []

  for (const candidate of sorted) {
    const isDupe = kept.some((existing) => {
      const dist = haversineDistance(candidate.lat, candidate.lng, existing.lat, existing.lng)
      if (dist > 0.25) return false    // >0.25 mi (~1320 ft): different campground
      if (dist < 0.04) return true     // <0.04 mi (~210 ft): same place, no question
      // 210–1320 ft: require name similarity too
      return tokenSimilarity(candidate.name, existing.name) > 0.35
    })

    if (!isDupe) kept.push(candidate)
  }

  return kept
}
