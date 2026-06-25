// Read-only probe to validate the data sources behind the Colorado data pack.
// Prints structure, counts, and field names WITHOUT leaking secrets.
//   node scripts/probe-sources.mjs
import fs from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
function loadEnvLocal() {
  const p = path.join(ROOT, '.env.local')
  const env = {}
  if (fs.existsSync(p)) {
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
  }
  return env
}
const env = loadEnvLocal()
const RECGOV_KEY = (env.RECGOV_API_KEY || process.env.RECGOV_API_KEY || '').trim()

// Colorado bounding box (lon/lat)
const CO = { xmin: -109.06, ymin: 36.99, xmax: -102.04, ymax: 41.0 }
const UA = 'ColoradoCampFinder/2.0 (data-pack probe)'

async function probeRIDB() {
  console.log('\n=== RIDB (recreation.gov facilities) ===')
  if (!RECGOV_KEY || RECGOV_KEY.includes('your_recgov_api_key')) {
    console.log('  RECGOV_API_KEY: NOT SET (placeholder/missing) — skipping live RIDB calls.')
    return
  }
  console.log(`  RECGOV_API_KEY: set (length ${RECGOV_KEY.length})`)
  const url = `https://ridb.recreation.gov/api/v1/facilities?state=CO&activity=9&limit=50&offset=0&full=true&apikey=${RECGOV_KEY}`
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' } })
    console.log('  HTTP', res.status)
    if (!res.ok) { console.log('  body:', (await res.text()).slice(0, 200)); return }
    const data = await res.json()
    console.log('  TOTAL_COUNT (all CO camping facilities):', data?.METADATA?.RESULTS?.TOTAL_COUNT)
    const recs = data.RECDATA || []
    console.log('  returned this page:', recs.length)
    const f = recs.find((r) => r.FacilityLatitude) || recs[0]
    if (f) {
      console.log('  sample facility fields:', JSON.stringify({
        FacilityID: f.FacilityID, FacilityName: f.FacilityName, Reservable: f.Reservable,
        lat: f.FacilityLatitude, lng: f.FacilityLongitude, type: f.FacilityTypeDescription,
        activities: (f.ACTIVITY || []).length,
      }))
      console.log('  all top-level keys:', Object.keys(f).join(', '))
    }
  } catch (e) { console.log('  ERROR', e.message) }
}

async function probeAvailability() {
  console.log("\n=== recreation.gov availability (from THIS machine's IP) ===")
  const id = '232459' // Moraine Park CG, RMNP — reachability/shape test only
  const month = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString()
  const url = `https://www.recreation.gov/api/camps/availability/campground/${id}/month?start_date=${encodeURIComponent(month)}`
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/json' } })
    console.log('  HTTP', res.status, '  (200 = this IP works; 403 = blocked)')
    if (res.ok) {
      const data = await res.json()
      const sites = Object.keys(data.campsites || {}).length
      console.log('  campsites in payload:', sites)
      const first = Object.values(data.campsites || {})[0]
      if (first) console.log('  sample site keys:', Object.keys(first).join(', '))
    }
  } catch (e) { console.log('  ERROR', e.message) }
}

async function arcgis(label, base, extra = {}) {
  const common = {
    where: '1=1',
    geometry: `${CO.xmin},${CO.ymin},${CO.xmax},${CO.ymax}`,
    geometryType: 'esriGeometryEnvelope', inSR: '4326',
    spatialRel: 'esriSpatialRelIntersects', f: 'json', ...extra,
  }
  const res = await fetch(`${base}/query?${new URLSearchParams(common)}`, { headers: { 'User-Agent': UA } })
  if (!res.ok) { console.log(`  ${label}: HTTP ${res.status}`); return null }
  return res.json()
}

async function probeBLM() {
  console.log('\n=== BLM Colorado Surface Management Agency ===')
  const base = 'https://gis.blm.gov/coarcgis/rest/services/lands/BLM_CO_SurfaceManagementAgency/MapServer'
  try {
    const meta = await (await fetch(`${base}?f=json`, { headers: { 'User-Agent': UA } })).json()
    console.log('  layers:', (meta.layers || []).map((l) => `${l.id}:${l.name}`).join(', ') || meta.error?.message || 'none')
    const layerId = meta.layers?.[0]?.id ?? 0
    const cnt = await arcgis('SMA', `${base}/${layerId}`, { returnCountOnly: 'true' })
    console.log('  feature count in CO bbox:', cnt?.count ?? cnt?.error?.message)
    const sample = await arcgis('SMA', `${base}/${layerId}`, { resultRecordCount: '1', outFields: '*', returnGeometry: 'false' })
    console.log('  sample attribute keys:', Object.keys(sample?.features?.[0]?.attributes || {}).join(', ') || sample?.error?.message)
  } catch (e) { console.log('  ERROR', e.message) }
}

async function probeMVUM() {
  console.log('\n=== USFS MVUM Roads (EDW national service, CO bbox) ===')
  const base = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1'
  try {
    const cnt = await arcgis('MVUM', base, { returnCountOnly: 'true' })
    console.log('  road feature count in CO bbox:', cnt?.count ?? cnt?.error?.message)
    const sample = await arcgis('MVUM', base, { resultRecordCount: '1', outFields: '*', returnGeometry: 'false' })
    console.log('  sample attribute keys:', Object.keys(sample?.features?.[0]?.attributes || {}).join(', ') || sample?.error?.message)
  } catch (e) { console.log('  ERROR', e.message) }
}

console.log('Colorado data-source probe — read-only validation')
await probeRIDB()
await probeAvailability()
await probeBLM()
await probeMVUM()
console.log('\nDone.')
