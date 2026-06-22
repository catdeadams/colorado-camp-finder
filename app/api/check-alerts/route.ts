import { NextResponse } from 'next/server'
import { readWatches, updateWatchCheck } from '@/lib/db'
import { getCampgroundAvailability } from '@/lib/recgov'
import { sendAvailabilityAlert } from '@/lib/email'

const CHECK_INTERVAL_MINUTES = 15

export async function POST() {
  const now = new Date()
  const cutoff = new Date(now.getTime() - CHECK_INTERVAL_MINUTES * 60 * 1000)

  const pending = readWatches().filter((w) => {
    if (!w.isActive) return false
    if (w.notifiedAt) return false  // already fired, stop checking
    if (w.lastCheckedAt && new Date(w.lastCheckedAt) > cutoff) return false
    return true
  })

  let checked = 0
  let notified = 0
  const errors: string[] = []

  for (const watch of pending) {
    try {
      const start = new Date(`${watch.startDate}T00:00:00Z`)
      const end = new Date(`${watch.endDate}T00:00:00Z`)

      // Only rec.gov watches support programmatic availability checks right now
      if (watch.campgroundSource !== 'recgov') {
        updateWatchCheck(watch.id, 'skipped', false)
        checked++
        continue
      }

      const avail = await getCampgroundAvailability(watch.campgroundId, start, end)
      const opened = avail.status === 'available' || avail.status === 'limited'

      let didNotify = false
      if (opened) {
        try {
          await sendAvailabilityAlert({
            to: watch.email,
            campgroundName: watch.campgroundName,
            availableSites: avail.availableSites,
            startDate: watch.startDate,
            endDate: watch.endDate,
            reserveUrl: watch.reserveUrl,
            source: watch.campgroundSource,
          })
          didNotify = true
          notified++
        } catch (emailErr) {
          errors.push(`Email failed for ${watch.campgroundName}: ${emailErr instanceof Error ? emailErr.message : emailErr}`)
        }
      }

      updateWatchCheck(watch.id, avail.status, didNotify)
      checked++
    } catch (err) {
      errors.push(`Check failed for ${watch.id}: ${err instanceof Error ? err.message : err}`)
    }
  }

  return NextResponse.json({ checked, notified, errors, skipped: pending.length - checked })
}
