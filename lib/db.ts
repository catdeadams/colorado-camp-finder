import fs from 'fs'
import path from 'path'

const DATA_DIR = path.join(process.cwd(), 'data')
const WATCHES_FILE = path.join(DATA_DIR, 'watches.json')

export interface Watch {
  id: string
  campgroundId: string
  campgroundName: string
  campgroundSource: string
  reserveUrl: string
  lat: number
  lng: number
  startDate: string
  endDate: string
  email: string
  createdAt: string
  lastCheckedAt: string | null
  lastStatus: string
  notifiedAt: string | null
  isActive: boolean
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
}

export function readWatches(): Watch[] {
  ensureDir()
  if (!fs.existsSync(WATCHES_FILE)) return []
  try {
    return JSON.parse(fs.readFileSync(WATCHES_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function saveWatches(watches: Watch[]): void {
  ensureDir()
  fs.writeFileSync(WATCHES_FILE, JSON.stringify(watches, null, 2), 'utf-8')
}

export function addWatch(
  input: Omit<Watch, 'id' | 'createdAt' | 'lastCheckedAt' | 'lastStatus' | 'notifiedAt' | 'isActive'>
): Watch {
  const watches = readWatches()
  const watch: Watch = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    lastCheckedAt: null,
    lastStatus: 'unknown',
    notifiedAt: null,
    isActive: true,
  }
  watches.push(watch)
  saveWatches(watches)
  return watch
}

export function removeWatch(id: string): void {
  const watches = readWatches()
  saveWatches(watches.map((w) => (w.id === id ? { ...w, isActive: false } : w)))
}

export function updateWatchCheck(id: string, status: string, didNotify: boolean): void {
  const watches = readWatches()
  saveWatches(
    watches.map((w) =>
      w.id !== id
        ? w
        : {
            ...w,
            lastCheckedAt: new Date().toISOString(),
            lastStatus: status,
            notifiedAt: didNotify ? new Date().toISOString() : w.notifiedAt,
          }
    )
  )
}
