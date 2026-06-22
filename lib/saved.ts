import type { Campground, DispersedSpot } from './types'

export type SavedItemType = 'campground' | 'dispersed'

export interface SavedItem {
  id: string
  type: SavedItemType
  savedAt: string
  campground?: Campground
  dispersed?: DispersedSpot
}

const STORAGE_KEY = 'co-camp-saved-v1'

function read(): SavedItem[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  } catch {
    return []
  }
}

function write(items: SavedItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function getSaved(): SavedItem[] {
  return read()
}

export function saveCampground(c: Campground): void {
  const items = read()
  if (items.some((i) => i.id === c.id)) return
  items.unshift({ id: c.id, type: 'campground', savedAt: new Date().toISOString(), campground: c })
  write(items)
}

export function saveDispersed(s: DispersedSpot): void {
  const items = read()
  if (items.some((i) => i.id === s.id)) return
  items.unshift({ id: s.id, type: 'dispersed', savedAt: new Date().toISOString(), dispersed: s })
  write(items)
}

export function removeSaved(id: string): void {
  write(read().filter((i) => i.id !== id))
}

export function isSaved(id: string): boolean {
  return read().some((i) => i.id === id)
}
