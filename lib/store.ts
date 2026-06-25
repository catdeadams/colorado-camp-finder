import Dexie, { type Table } from 'dexie'
import type { Campground } from './types'

// Local-first store (IndexedDB). No accounts — everything lives on the device.
// Replaces the old localStorage-based lib/saved.ts.

export interface SavedSite {
  id: string
  kind: 'campground' | 'dispersed'
  name: string
  lat: number
  lng: number
  savedAt: number
  campground?: Campground // present when kind === 'campground'
  note?: string
  custom?: boolean        // true for user-dropped dispersed pins
}

class CampDB extends Dexie {
  saved!: Table<SavedSite, string>
  constructor() {
    super('co-camp-finder')
    this.version(1).stores({ saved: 'id, kind, savedAt' })
  }
}

export const db = new CampDB()

export async function listSaved(): Promise<SavedSite[]> {
  return db.saved.orderBy('savedAt').reverse().toArray()
}

export async function saveCampground(c: Campground): Promise<void> {
  await db.saved.put({
    id: c.id, kind: 'campground', name: c.name, lat: c.lat, lng: c.lng,
    savedAt: Date.now(), campground: c,
  })
}

export async function saveCustomPin(p: { name: string; lat: number; lng: number; note?: string }): Promise<SavedSite> {
  const site: SavedSite = {
    id: `pin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    kind: 'dispersed', name: p.name, lat: p.lat, lng: p.lng,
    savedAt: Date.now(), custom: true, note: p.note,
  }
  await db.saved.put(site)
  return site
}

export async function removeSaved(id: string): Promise<void> {
  await db.saved.delete(id)
}

/** Export the full saved set as a JSON string (for share/backup). */
export async function exportSaved(): Promise<string> {
  const items = await listSaved()
  return JSON.stringify({ app: 'co-camp-finder', version: 1, exportedAt: Date.now(), items }, null, 2)
}

/** Merge an exported saved set back in (import/share). Returns count added. */
export async function importSaved(json: string): Promise<number> {
  const parsed = JSON.parse(json) as { items?: SavedSite[] }
  const items = parsed.items ?? []
  await db.saved.bulkPut(items)
  return items.length
}
