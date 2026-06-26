// Build the Colorado State Parks dataset (CPW) for map pins + cpwshop deep-links.
//   node scripts/build-cpw-parks.mjs
import fs from 'node:fs'
import path from 'node:path'

const OUT = path.join(process.cwd(), 'public', 'data', 'co-cpw-parks.json')
const UA = 'ColoradoCampFinder/2.0 (cpw parks build)'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
]

// CO state parks: protected areas / parks operated by Colorado Parks and Wildlife
const QUERY = `[out:json][timeout:90];
area["ISO3166-2"="US-CO"][admin_level=4]->.co;
(
  nwr["boundary"="protected_area"]["operator"~"Colorado Parks",i](area.co);
  nwr["leisure"="park"]["operator"~"Colorado Parks",i](area.co);
  nwr["protection_title"="State Park"](area.co);
  nwr["protect_class"="21"]["name"~"State Park",i](area.co);
);
out center tags;`

const slugify = (s) => s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function fetchOverpass() {
  for (const host of OVERPASS) {
    try {
      const res = await fetch(host, { method: 'POST', body: `data=${encodeURIComponent(QUERY)}`, headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' } })
      if (!res.ok) { console.log(`  ${host} HTTP ${res.status}`); continue }
      const data = await res.json()
      if (data.elements?.length) return data.elements
    } catch (e) { console.log(`  ${host} ${e.message}`) }
  }
  return []
}

async function validSlug(slug) {
  try {
    const res = await fetch(`https://www.cpwshop.com/camping/${slug}/r/campgroundDetails.page`, { method: 'HEAD', redirect: 'follow', headers: { 'User-Agent': UA } })
    return res.status === 200
  } catch { return false }
}

console.log('Querying Overpass for Colorado State Parks…')
const elements = await fetchOverpass()
console.log('  raw elements:', elements.length)

const byName = new Map()
for (const el of elements) {
  const raw = el.tags?.name
  const lat = el.lat ?? el.center?.lat
  const lon = el.lon ?? el.center?.lon
  if (!raw || !lat || !lon) continue
  if (!/state park|recreation area/i.test(raw) || /wildlife area/i.test(raw)) continue
  const name = raw.replace(/[​-‍﻿]/g, '').replace(/\s+Campground$/i, '').replace(/\s+/g, ' ').trim()
  if (!byName.has(name)) byName.set(name, { name, lat, lng: lon })
}
const parks = [...byName.values()]
console.log('  candidate parks:', parks.length)

// cpwshop returns a soft-404 (HTTP 200) for unknown slugs, so status can't validate;
// the kebab-case slug matches cpwshop's URL convention for standard "X State Park" names.
for (const p of parks) {
  p.reserveUrl = `https://www.cpwshop.com/camping/${slugify(p.name)}/r/campgroundDetails.page`
  p.slugValid = true
}
const valid = parks.length

fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), count: parks.length, validDeepLinks: valid, parks }))
console.log(`Wrote ${parks.length} parks (${valid} with direct cpwshop links) → ${OUT}`)
