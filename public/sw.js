const TILE_CACHE = 'osm-tiles-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()))

// Cache OSM tile requests as they're fetched during normal browsing
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (url.hostname !== 'tile.openstreetmap.org') return

  e.respondWith(
    caches.open(TILE_CACHE).then(async (cache) => {
      const cached = await cache.match(e.request)
      if (cached) return cached
      const response = await fetch(e.request)
      if (response.ok) cache.put(e.request, response.clone())
      return response
    })
  )
})

// Pre-cache a batch of tile URLs (sent from "Cache area" button)
self.addEventListener('message', async (e) => {
  if (e.data?.type !== 'CACHE_TILES') return

  const urls = e.data.urls ?? []
  const cache = await caches.open(TILE_CACHE)
  const clientList = await clients.matchAll()

  let done = 0
  for (let i = 0; i < urls.length; i++) {
    try {
      const existing = await cache.match(urls[i])
      if (!existing) {
        const res = await fetch(urls[i], { mode: 'no-cors' })
        if (res.ok || res.type === 'opaque') await cache.put(urls[i], res)
      }
      done++
    } catch { /* skip failed tile */ }

    if (i % 25 === 0 || i === urls.length - 1) {
      clientList.forEach((c) =>
        c.postMessage({ type: 'CACHE_PROGRESS', done: i + 1, total: urls.length })
      )
    }
  }

  clientList.forEach((c) =>
    c.postMessage({ type: 'CACHE_DONE', done, total: urls.length })
  )
})
