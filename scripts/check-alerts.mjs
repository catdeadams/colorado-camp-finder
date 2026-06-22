/**
 * Standalone alert checker — run this on a schedule via Windows Task Scheduler.
 * Requires the Next.js dev server to be running (npm run dev).
 *
 * Setup:
 *   1. Open Task Scheduler → Create Basic Task
 *   2. Trigger: Daily, repeat every 15 minutes
 *   3. Action: Start a program
 *      Program: node
 *      Arguments: "C:\path\to\colorado-camping-finder\scripts\check-alerts.mjs"
 */

const APP_URL = process.env.APP_URL || 'http://localhost:3000'

async function run() {
  const start = Date.now()
  console.log(`[${new Date().toISOString()}] Running alert check...`)

  try {
    const res = await fetch(`${APP_URL}/api/check-alerts`, { method: 'POST' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = await res.json()
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    console.log(`Done in ${elapsed}s — checked: ${data.checked}, notified: ${data.notified}`)

    if (data.errors?.length) {
      console.warn('Errors:', data.errors)
    }
  } catch (err) {
    console.error('Alert check failed:', err.message)
    console.error('Is the app running at', APP_URL, '?')
    process.exit(1)
  }
}

run()
