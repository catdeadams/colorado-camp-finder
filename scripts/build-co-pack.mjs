// Build the Colorado data pack: campgrounds + public land + MVUM roads.
// Writes normalized files to public/data/ and reports raw + gzipped sizes.
//   node scripts/build-co-pack.mjs
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'public', 'data')
fs.mkdirSync(OUT, { recursive: true })

const UA = 'ColoradoCampFinder/2.0 (pack builder)'
const CO = { xmin: -109.06, ymin: 36.99, xmax: -102.04, ymax: 41.0 }

function loadEnv() {
  const p = path.join(ROOT, '.env.local'); const env = {}
  if (fs.existsSync(p)) for (const l of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return env
}
const RECGOV_KEY = (loadEnv().RECGOV_API_KEY || '').trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJSON(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/json' } })
      if (res.ok) return res.json()
      if (res.status === 429 || res.status >= 500) { await sleep(1500 * (i + 1)); continue }
      return { __http: res.status }
    } catch (e) { if (i === tries - 1) return { __err: e.message }; await sleep(1000) }
  }
  return { __err: 'exhausted' }
}

function measure(name, obj) {
  const json = JSON.stringify(obj)
  const raw = Buffer.byteLength(json)
  const gz = zlib.gzipSync(json, { level: 9 }).length
  fs.writeFileSync(path.join(OUT, name), json)
  const mb = (n) => (n / 1048576).toFixed(2)
  console.log(`  wrote ${name}: ${mb(raw)} MB raw / ${mb(gz)} MB gzip`)
  return { raw, gz }
}

// ── Campgrounds (RIDB) ────────────────────────────────────────────────────────
async function buildCampgrounds() {
  console.log('\n[campgrounds] RIDB facilities (CO, camping)…')
  if (!RECGOV_KEY) { console.log('  no key; skipping'); return }
  const all = []
  for (let offset = 0; ; offset += 50) {
    const url = `https://ridb.recreation.gov/api/v1/facilities?state=CO&activity=9&limit=50&offset=${offset}&full=true&apikey=${RECGOV_KEY}`
    const data = await getJSON(url)
    const recs = data.RECDATA || []
    for (const f of recs) {
      if (!f.FacilityLatitude || !f.FacilityLongitude) continue
      const media = (f.MEDIA || []).find((m) => m.MediaType === 'Image')
      all.push({
        id: String(f.FacilityID),
        name: f.FacilityName,
        lat: f.FacilityLatitude,
        lng: f.FacilityLongitude,
        reservable: f.Reservable === true,
        type: f.FacilityTypeDescription || '',
        phone: (f.FacilityPhone || '').trim() || undefined,
        reserveUrl: f.FacilityReservationURL || `https://www.recreation.gov/camping/campgrounds/${f.FacilityID}`,
        recAreaId: f.ParentRecAreaID ? String(f.ParentRecAreaID) : undefined,
        activities: (f.ACTIVITY || []).map((a) => a.ActivityName).slice(0, 10),
        photo: media?.URL,
        siteCount: Array.isArray(f.CAMPSITE) ? f.CAMPSITE.length : undefined,
      })
    }
    process.stdout.write(`\r  fetched ${all.length}…`)
    if (recs.length < 50) break
    await sleep(200)
  }
  console.log()
  console.log('  total CO camping facilities:', all.length)
  console.log('  reservable:', all.filter((c) => c.reservable).length, '/ first-come(or unknown):', all.filter((c) => !c.reservable).length)
  measure('co-campgrounds.json', { generated: new Date().toISOString(), count: all.length, campgrounds: all })
}

// ── Generic ArcGIS GeoJSON pagination ─────────────────────────────────────────
async function fetchArcGISGeoJSON(label, base, { outFields, where = '1=1', simplify = 0, pageSize = 1000, maxPages = 60 }) {
  const features = []
  for (let page = 0; page < maxPages; page++) {
    const q = new URLSearchParams({
      where, geometry: `${CO.xmin},${CO.ymin},${CO.xmax},${CO.ymax}`,
      geometryType: 'esriGeometryEnvelope', inSR: '4326', outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: 'true',
      resultOffset: String(page * pageSize), resultRecordCount: String(pageSize), f: 'geojson',
    })
    if (simplify) q.set('maxAllowableOffset', String(simplify))
    const data = await getJSON(`${base}/query?${q}`)
    const fs_ = data.features || []
    features.push(...fs_)
    process.stdout.write(`\r  ${label}: ${features.length} features…`)
    if (fs_.length < pageSize) break
    await sleep(250)
  }
  console.log()
  return features
}

// ── Public land (BLM CO Surface Management Agency) ────────────────────────────
async function buildPublicLand() {
  console.log('\n[public land] BLM CO Surface Management Agency…')
  const base = 'https://gis.blm.gov/coarcgis/rest/services/lands/BLM_Colorado_Surface_Management_Agency/MapServer/1'
  const where = "adm_manage IN ('BLM','USFS','USFS_NG','USFS_LU','NPS','STA','BOR','USFW')"
  const feats = await fetchArcGISGeoJSON('SMA', base, { outFields: 'adm_manage,adm_name,GIS_acres', where, simplify: 0.0008 })
  // Trim properties to essentials
  for (const f of feats) {
    const p = f.properties || {}
    f.properties = { agency: p.adm_manage, name: p.adm_name || null, acres: Math.round(p.GIS_acres || 0) }
  }
  measure('co-public-land.geojson', { type: 'FeatureCollection', features: feats })
}

// ── MVUM roads (USFS EDW) ─────────────────────────────────────────────────────
async function buildMVUM() {
  console.log('\n[mvum] USFS MVUM roads (CO)…')
  const base = 'https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_MVUM_01/MapServer/1'
  const outFields = 'name,id,surfacetype,operationalmaintlevel,passengervehicle,highclearancevehicle,fourwd_gt50inches,seasonal,routestatus,forestname,districtname'
  const feats = await fetchArcGISGeoJSON('MVUM', base, { outFields, simplify: 0.0004 })
  for (const f of feats) {
    const p = f.properties || {}
    f.properties = {
      name: p.name || p.id || null,
      surface: p.surfacetype || null,
      maint: p.operationalmaintlevel || null,
      car: p.passengervehicle || null,
      hc: p.highclearancevehicle || null,
      fourwd: p.fourwd_gt50inches || null,
      seasonal: p.seasonal || null,
      status: p.routestatus || null,
      forest: p.forestname || null,
    }
  }
  measure('co-mvum-roads.geojson', { type: 'FeatureCollection', features: feats })
}

console.log('Building Colorado data pack →', OUT)
await buildCampgrounds()
await buildPublicLand()
await buildMVUM()
console.log('\nDone. (Basemap PMTiles handled separately.)')
