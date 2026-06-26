// Colorado Camp Finder — offline service worker.
// Caches the app shell, data pack, terrain tiles, glyphs, and the vector
// basemap so the map works with no signal. The 112MB PMTiles file is served
// via byte-range slicing from a single cached copy (after "Download Colorado").

const VERSION = 'v2'
const SHELL = `shell-${VERSION}`
const DATA = `data-${VERSION}`
const TILES = `tiles-${VERSION}`
const PMTILES = `pmtiles-${VERSION}`
const PMTILES_PATH = '/co-basemap.pmtiles'

const DATA_FILES = ['/data/co-campgrounds.json', '/data/co-public-land.geojson', '/data/co-mvum-roads.geojson']

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const keys = await caches.keys()
  await Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k)))
  await self.clients.claim()
})()))

const isTerrain = (u) => u.hostname === 's3.amazonaws.com' && u.pathname.includes('/terrarium/')
const isMapAsset = (u) => u.hostname === 'protomaps.github.io' || u.hostname.endsWith('demotiles.maplibre.org')
const isImmutable = (u) => u.origin === self.location.origin && u.pathname.startsWith('/_next/static/')

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Never intercept dynamic APIs or dev HMR — let them hit the network.
  if (url.origin === self.location.origin && (url.pathname.startsWith('/api/') || url.pathname.includes('hot-update') || url.pathname.includes('webpack-hmr'))) return

  if (url.pathname === PMTILES_PATH) { e.respondWith(handlePmtiles(req)); return }
  if (url.pathname.startsWith('/data/')) { e.respondWith(cacheFirst(req, DATA)); return }
  if (isTerrain(url)) { e.respondWith(cacheFirst(req, TILES)); return }
  if (isMapAsset(url) || isImmutable(url)) { e.respondWith(cacheFirst(req, SHELL)); return }
  if (url.origin === self.location.origin) { e.respondWith(staleWhileRevalidate(req, SHELL)); return }
})

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req)
  if (hit) return hit
  try {
    const res = await fetch(req)
    if (res.ok) cache.put(req, res.clone())
    return res
  } catch {
    return hit || new Response(null, { status: 504 })
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName)
  const hit = await cache.match(req)
  const net = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res }).catch(() => null)
  return hit || (await net) || new Response(null, { status: 504 })
}

// Hold the full basemap blob once (browser keeps large blobs disk-backed); serve
// cheap byte-range views from it so panning offline doesn't reload 112MB per tile.
let pmtilesBlob = null
async function handlePmtiles(req) {
  const range = req.headers.get('range')
  if (!pmtilesBlob) {
    const cache = await caches.open(PMTILES)
    const full = await cache.match(new Request(PMTILES_PATH))
    if (!full) return fetch(req)   // not downloaded yet → normal online range request
    pmtilesBlob = await full.blob()
  }
  if (!range) return new Response(pmtilesBlob.slice(), { status: 200 })
  const m = /bytes=(\d+)-(\d*)/.exec(range)
  if (!m) return new Response(pmtilesBlob.slice(), { status: 200 })
  const start = parseInt(m[1], 10)
  const end = m[2] ? parseInt(m[2], 10) : pmtilesBlob.size - 1
  return new Response(pmtilesBlob.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Range': `bytes ${start}-${end}/${pmtilesBlob.size}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
      'Content-Type': 'application/octet-stream',
    },
  })
}

// "Download Colorado" — pre-cache the data pack + the full basemap for offline.
self.addEventListener('message', (e) => {
  if (e.data?.type === 'DOWNLOAD_PACK') e.waitUntil(downloadPack())
})

async function downloadPack() {
  const post = async (msg) => (await self.clients.matchAll()).forEach((c) => c.postMessage(msg))
  try {
    const dataCache = await caches.open(DATA)
    for (const f of DATA_FILES) await dataCache.add(f)
    await post({ type: 'PACK_PROGRESS', pct: 10, label: 'Camping data saved' })

    // Stream the basemap so we can report progress on the big download.
    const res = await fetch(PMTILES_PATH)
    const total = Number(res.headers.get('content-length')) || 117_000_000
    const reader = res.body.getReader()
    const chunks = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.length
      await post({ type: 'PACK_PROGRESS', pct: 10 + Math.round((received / total) * 88), label: `Basemap ${(received / 1048576).toFixed(0)} MB` })
    }
    const blob = new Blob(chunks, { type: 'application/octet-stream' })
    const pmCache = await caches.open(PMTILES)
    await pmCache.put(new Request(PMTILES_PATH), new Response(blob, { status: 200, headers: { 'Content-Length': String(blob.size), 'Accept-Ranges': 'bytes' } }))
    pmtilesBlob = blob
    await post({ type: 'PACK_DONE', pct: 100 })
  } catch (err) {
    await post({ type: 'PACK_ERROR', error: String(err) })
  }
}

// Report whether the offline pack is already downloaded.
self.addEventListener('message', async (e) => {
  if (e.data?.type !== 'PACK_STATUS') return
  const pmCache = await caches.open(PMTILES)
  const has = await pmCache.match(new Request(PMTILES_PATH))
  ;(await self.clients.matchAll()).forEach((c) => c.postMessage({ type: 'PACK_STATUS', downloaded: !!has }))
})
