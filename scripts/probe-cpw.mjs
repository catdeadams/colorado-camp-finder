// Read-only recon of cpwshop.com (Aspira IPAWS) to scope the CPW availability spike.
//   node scripts/probe-cpw.mjs
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

async function probe(url) {
  console.log('\n===== GET', url)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, accept: 'text/html,application/json,*/*' }, redirect: 'follow' })
    console.log('  final URL :', res.url)
    console.log('  status    :', res.status)
    console.log('  server    :', res.headers.get('server'))
    console.log('  set-cookie:', (res.headers.get('set-cookie') || '').slice(0, 120))
    const body = await res.text()
    const lc = body.toLowerCase()
    console.log('  body length:', body.length)
    console.log('  queue-it? ', lc.includes('queue-it') || lc.includes('queueit'))
    console.log('  aspira?   ', lc.includes('aspira'))
    console.log('  usedirect?', lc.includes('usedirect'))
    console.log('  angular/react?', lc.includes('ng-version') ? 'angular' : (lc.includes('__next') || lc.includes('react') ? 'react-ish' : 'unknown'))
    const hosts = [...new Set([...body.matchAll(/https?:\/\/([a-z0-9.\-]+)/gi)].map((m) => m[1].toLowerCase()))]
      .filter((h) => !h.includes('w3.org') && !h.includes('schema.org'))
    console.log('  referenced hosts:', hosts.slice(0, 25).join(', '))
    const apis = [...new Set([...body.matchAll(/["'](\/?[a-z0-9._\-\/]*(api|rest|jaxrs|search|availability|rdr|grid)[a-z0-9._\-\/]*)["']/gi)].map((m) => m[1]))]
    console.log('  api-ish paths:', apis.slice(0, 20).join(' | ') || 'none in static HTML')
  } catch (e) { console.log('  ERROR', e.message) }
}

await probe('https://www.cpwshop.com/')
await probe('https://www.cpwshop.com/camping.page')
await probe('https://cpwshop.com/Camping.aspx')
console.log('\nNote: SPA XHRs (the real availability calls) fire in-browser and may not appear in static HTML.')
console.log('Done.')
