// Tag each MVUM road with along-road slope + flatness rating, sampled from the
// AWS Terrarium DEM. Rewrites public/data/co-mvum-roads.geojson in place.
//   node scripts/compute-road-slope.mjs [zoom]
import fs from 'node:fs'
import path from 'node:path'
import { PNG } from 'pngjs'

const ROOT = process.cwd()
const FILE = path.join(ROOT, 'public', 'data', 'co-mvum-roads.geojson')
const Z = parseInt(process.argv[2] || '12', 10)
const MAX_PTS = 8            // sample up to N vertices per road
const MIN_SEG_M = 25         // ignore micro-segments when averaging slope
const CONCURRENCY = 16
const UA = 'ColoradoCampFinder/2.0 (slope build)'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Web Mercator tile math ──
function project(lng, lat) {
  const n = 2 ** Z
  const x = ((lng + 180) / 360) * n
  const latRad = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  return { x, y }
}
function tileOf(lng, lat) {
  const { x, y } = project(lng, lat)
  return { tx: Math.floor(x), ty: Math.floor(y), px: Math.min(255, Math.floor((x % 1) * 256)), py: Math.min(255, Math.floor((y % 1) * 256)) }
}
function haversineM(a, b) {
  const R = 6371000
  const dLat = ((b[1] - a[1]) * Math.PI) / 180
  const dLng = ((b[0] - a[0]) * Math.PI) / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s))
}

// Evenly sample up to MAX_PTS vertices (always include endpoints)
function sampleVertices(coords) {
  if (coords.length <= MAX_PTS) return coords
  const out = []
  for (let i = 0; i < MAX_PTS; i++) out.push(coords[Math.round((i * (coords.length - 1)) / (MAX_PTS - 1))])
  return out
}

function ratingOf(deg) {
  if (deg < 3) return 'flat'
  if (deg < 6) return 'gentle'
  if (deg < 10) return 'moderate'
  return 'steep'
}

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'))
const feats = data.features.filter((f) => f.geometry?.type === 'LineString' && f.geometry.coordinates.length >= 2)
console.log(`MVUM features: ${feats.length} (zoom ${Z})`)

// ── Pass 1: gather sample points + needed tiles ──
const perRoad = []
const tileKeys = new Set()
for (const f of feats) {
  const pts = sampleVertices(f.geometry.coordinates).map(([lng, lat]) => ({ lng, lat, ...tileOf(lng, lat) }))
  pts.forEach((p) => tileKeys.add(`${p.tx}/${p.ty}`))
  perRoad.push({ f, pts })
}
const uniqueTiles = [...tileKeys]
console.log(`Unique Terrarium tiles to fetch: ${uniqueTiles.length}`)

// ── Pass 2: download + decode tiles → Int16 elevation grids ──
const grids = new Map() // "tx/ty" -> Int16Array(256*256) | null
let done = 0
async function fetchTile(key) {
  const [tx, ty] = key.split('/').map(Number)
  const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!res.ok) { if (res.status === 404) { grids.set(key, null); return } await sleep(500 * (attempt + 1)); continue }
      const buf = Buffer.from(await res.arrayBuffer())
      const png = PNG.sync.read(buf)
      const g = new Int16Array(256 * 256)
      for (let i = 0; i < 256 * 256; i++) {
        const r = png.data[i * 4], gg = png.data[i * 4 + 1], b = png.data[i * 4 + 2]
        g[i] = Math.round(r * 256 + gg + b / 256 - 32768)
      }
      grids.set(key, g)
      return
    } catch { await sleep(500 * (attempt + 1)) }
  }
  grids.set(key, null)
}
async function runPool(keys) {
  let idx = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (idx < keys.length) {
      const k = keys[idx++]
      await fetchTile(k)
      if (++done % 100 === 0 || done === keys.length) process.stdout.write(`\r  tiles ${done}/${keys.length}`)
    }
  }))
  console.log()
}
console.log('Downloading terrain tiles…')
await runPool(uniqueTiles)

function elevAt(p) {
  const g = grids.get(`${p.tx}/${p.ty}`)
  if (!g) return null
  return g[p.py * 256 + p.px]
}

// ── Pass 3: compute along-road slope ──
const dist = { flat: 0, gentle: 0, moderate: 0, steep: 0, unknown: 0 }
for (const { f, pts } of perRoad) {
  let sumAng = 0, sumLen = 0
  for (let i = 1; i < pts.length; i++) {
    const e1 = elevAt(pts[i - 1]), e2 = elevAt(pts[i])
    if (e1 == null || e2 == null) continue
    const horiz = haversineM([pts[i - 1].lng, pts[i - 1].lat], [pts[i].lng, pts[i].lat])
    if (horiz < MIN_SEG_M) continue
    const ang = (Math.atan(Math.abs(e2 - e1) / horiz) * 180) / Math.PI
    sumAng += ang * horiz
    sumLen += horiz
  }
  if (sumLen > 0) {
    const slope = Math.round((sumAng / sumLen) * 10) / 10
    f.properties.slope = slope
    f.properties.flat = ratingOf(slope)
  } else {
    f.properties.slope = null
    f.properties.flat = 'unknown'
  }
  dist[f.properties.flat]++
}

fs.writeFileSync(FILE, JSON.stringify(data))
console.log('Flatness distribution:', dist)
console.log('Wrote', FILE)
