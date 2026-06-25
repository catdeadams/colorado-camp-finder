// Discover the correct public-land "Surface Management Agency" service for Colorado.
//   node scripts/probe-blm.mjs
const UA = 'ColoradoCampFinder/2.0 (service discovery)'
const CO = { xmin: -109.06, ymin: 36.99, xmax: -102.04, ymax: 41.0 }

async function getJSON(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, accept: 'application/json' } })
    if (!res.ok) return { __http: res.status }
    return await res.json()
  } catch (e) { return { __err: e.message } }
}

async function listServices(root) {
  console.log(`\n--- ${root} ---`)
  const data = await getJSON(`${root}?f=json`)
  if (data.__http || data.__err) { console.log('  unreachable:', data.__http || data.__err); return }
  if (data.folders) console.log('  folders:', data.folders.join(', '))
  if (data.services) {
    const hits = data.services.filter((s) => /sma|surface|manage|admin|ownership|land/i.test(s.name))
    console.log('  matching services:', hits.map((s) => `${s.name} (${s.type})`).join(' | ') || '(none of interest)')
  }
}

async function countAt(label, base) {
  const q = new URLSearchParams({
    where: '1=1', geometry: `${CO.xmin},${CO.ymin},${CO.xmax},${CO.ymax}`,
    geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    returnCountOnly: 'true', f: 'json',
  })
  const data = await getJSON(`${base}/query?${q}`)
  console.log(`  ${label}: count=${data.count ?? data.error?.message ?? data.__http ?? data.__err}`)
  if (typeof data.count === 'number' && data.count > 0) {
    const s = await getJSON(`${base}/query?${new URLSearchParams({ where: '1=1', geometry: `${CO.xmin},${CO.ymin},${CO.xmax},${CO.ymax}`, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', resultRecordCount: '1', outFields: '*', returnGeometry: 'false', f: 'json' })}`)
    console.log('    sample fields:', Object.keys(s.features?.[0]?.attributes || {}).join(', '))
  }
}

// 1) Enumerate candidate ArcGIS roots
await listServices('https://gis.blm.gov/arcgis/rest/services/lands')
await listServices('https://gis.blm.gov/coarcgis/rest/services')
await listServices('https://gis.blm.gov/coarcgis/rest/services/lands')

// 2) Probe known/likely SMA endpoints directly
console.log('\n--- direct endpoint probes (CO bbox counts) ---')
await countAt('BLM Natl SMA Cadastral (lands/0)', 'https://gis.blm.gov/arcgis/rest/services/lands/BLM_Natl_SMA_Cadastral_Data/MapServer/1')
await countAt('PAD-US 4 (USGS) manager', 'https://gis1.usgs.gov/arcgis/rest/services/padus4_0/Manager_Name/MapServer/0')
await countAt('PAD-US 3 (USGS) fee', 'https://gis1.usgs.gov/arcgis/rest/services/padus3_0/Manager_Name/MapServer/0')

console.log('\nDone.')
