// Probe the BLM Colorado Surface Management Agency service in detail.
//   node scripts/probe-sma.mjs
const UA = 'ColoradoCampFinder/2.0'
const CO = { xmin: -109.06, ymin: 36.99, xmax: -102.04, ymax: 41.0 }
const BASE = 'https://gis.blm.gov/coarcgis/rest/services/lands/BLM_Colorado_Surface_Management_Agency/MapServer'

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/json' } })
  if (!res.ok) return { __http: res.status }
  return res.json()
}
const env = (o) => new URLSearchParams({
  where: o.where ?? '1=1', geometry: `${CO.xmin},${CO.ymin},${CO.xmax},${CO.ymax}`,
  geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', f: 'json', ...o,
})

const meta = await getJSON(`${BASE}?f=json`)
console.log('layers:', (meta.layers || []).map((l) => `${l.id}:${l.name} [${l.geometryType}]`).join(' | '))

for (const layer of meta.layers || []) {
  const base = `${BASE}/${layer.id}`
  const cnt = await getJSON(`${base}/query?${env({ returnCountOnly: 'true' })}`)
  console.log(`\nLayer ${layer.id} (${layer.name}): CO count=${cnt.count ?? cnt.error?.message}`)
  const s = await getJSON(`${base}/query?${env({ resultRecordCount: '1', outFields: '*', returnGeometry: 'false' })}`)
  const attrs = s.features?.[0]?.attributes || {}
  console.log('  fields:', Object.keys(attrs).join(', '))
  console.log('  sample:', JSON.stringify(attrs).slice(0, 300))
  // Look for the agency/owner field and list distinct values
  const agencyField = Object.keys(attrs).find((k) => /agncy|agency|admin|owner|mgmt|manage/i.test(k))
  if (agencyField) {
    const d = await getJSON(`${base}/query?${env({ outFields: agencyField, returnDistinctValues: 'true', returnGeometry: 'false', resultRecordCount: '50' })}`)
    const vals = [...new Set((d.features || []).map((f) => f.attributes[agencyField]))]
    console.log(`  distinct ${agencyField}:`, vals.join(', '))
  }
}
console.log('\nDone.')
