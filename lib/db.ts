import { Redis } from '@upstash/redis'

// Durable watch store backed by Upstash Redis (REST — works in Vercel
// serverless). Watches live in a single hash keyed by watch id, so the
// scheduler and the API both see the same data across invocations.
// Requires UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.

const KEY = 'watches'

let client: Redis | null = null
// Lazy so importing this module (e.g. during `next build`) doesn't throw when
// the env vars aren't present; the credentials are only needed at call time.
function redis(): Redis {
  if (!client) client = Redis.fromEnv()
  return client
}

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

export async function readWatches(): Promise<Watch[]> {
  const all = await redis().hgetall<Record<string, Watch>>(KEY)
  return all ? Object.values(all) : []
}

export async function addWatch(
  input: Omit<Watch, 'id' | 'createdAt' | 'lastCheckedAt' | 'lastStatus' | 'notifiedAt' | 'isActive'>
): Promise<Watch> {
  const watch: Watch = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    lastCheckedAt: null,
    lastStatus: 'unknown',
    notifiedAt: null,
    isActive: true,
  }
  await redis().hset(KEY, { [watch.id]: watch })
  return watch
}

export async function removeWatch(id: string): Promise<void> {
  await redis().hdel(KEY, id)
}

export async function updateWatchCheck(id: string, status: string, didNotify: boolean): Promise<void> {
  const all = await redis().hgetall<Record<string, Watch>>(KEY)
  const watch = all?.[id]
  if (!watch) return
  watch.lastCheckedAt = new Date().toISOString()
  watch.lastStatus = status
  if (didNotify) watch.notifiedAt = new Date().toISOString()
  await redis().hset(KEY, { [id]: watch })
}
