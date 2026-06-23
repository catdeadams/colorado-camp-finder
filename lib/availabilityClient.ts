'use client'

// Browser-side rec.gov availability checker.
// Called from client components AFTER the search API returns a facility list.
// Avoids server-side blocking — rec.gov's availability endpoint is their own
// browser-facing calendar API and works fine when called directly from the browser.

const AVAIL_BASE = 'https://www.recreation.gov/api/camps/availability/campground'

export interface AvailResult {
  status: 'available' | 'limited' | 'full' | 'unknown'
  availableSites: number
  totalSites: number
}

function getMonthsInRange(start: Date, end: Date): Date[] {
  const months: Date[] = []
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const endM = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))
  while (cur <= endM) {
    months.push(new Date(cur))
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  return months
}

function getDatesInRange(start: Date, end: Date): Date[] {
  const dates: Date[] = []
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const endD = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))
  while (cur < endD) {
    dates.push(new Date(cur))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

export async function checkCampgroundAvailability(
  facilityId: string,
  startDate: Date,
  endDate: Date,
): Promise<AvailResult> {
  const months = getMonthsInRange(startDate, endDate)
  const allSiteAvail: Record<string, Record<string, string>> = {}

  await Promise.allSettled(
    months.map(async (monthStart) => {
      try {
        const res = await fetch(
          `${AVAIL_BASE}/${facilityId}/month?start_date=${monthStart.toISOString()}`,
          { signal: AbortSignal.timeout(8000) },
        )
        if (!res.ok) return
        const data = await res.json()
        for (const [siteId, siteData] of Object.entries(
          data.campsites as Record<string, { availabilities: Record<string, string> }>,
        )) {
          if (!allSiteAvail[siteId]) allSiteAvail[siteId] = {}
          Object.assign(allSiteAvail[siteId], siteData.availabilities)
        }
      } catch {
        // network error or timeout — skip this month
      }
    }),
  )

  const totalSites = Object.keys(allSiteAvail).length
  if (totalSites === 0) return { status: 'unknown', availableSites: 0, totalSites: 0 }

  const datesToCheck = getDatesInRange(startDate, endDate)
  let availableSites = 0

  for (const availabilities of Object.values(allSiteAvail)) {
    const fullyAvailable = datesToCheck.every((date) => {
      const key = date.toISOString().replace('.000Z', 'Z')
      return availabilities[key] === 'Available'
    })
    if (fullyAvailable) availableSites++
  }

  const status =
    availableSites === 0
      ? 'full'
      : availableSites <= Math.ceil(totalSites * 0.2)
        ? 'limited'
        : 'available'

  return { status, availableSites, totalSites }
}

// Flexible mode: scan a window for any consecutive block of `tripNights` length.
export async function checkFlexibleAvailability(
  facilityId: string,
  windowStart: Date,
  windowEnd: Date,
  tripNights: number,
): Promise<AvailResult> {
  const months = getMonthsInRange(windowStart, windowEnd)
  const allSiteAvail: Record<string, Record<string, string>> = {}

  await Promise.allSettled(
    months.map(async (monthStart) => {
      try {
        const res = await fetch(
          `${AVAIL_BASE}/${facilityId}/month?start_date=${monthStart.toISOString()}`,
          { signal: AbortSignal.timeout(8000) },
        )
        if (!res.ok) return
        const data = await res.json()
        for (const [siteId, siteData] of Object.entries(
          data.campsites as Record<string, { availabilities: Record<string, string> }>,
        )) {
          if (!allSiteAvail[siteId]) allSiteAvail[siteId] = {}
          Object.assign(allSiteAvail[siteId], siteData.availabilities)
        }
      } catch {
        // skip
      }
    }),
  )

  const totalSites = Object.keys(allSiteAvail).length
  if (totalSites === 0) return { status: 'unknown', availableSites: 0, totalSites: 0 }

  // Build list of all dates in the window
  const allDates = getDatesInRange(windowStart, windowEnd)

  // For each site, find if any consecutive block of tripNights is fully available
  let sitesWithBlock = 0
  for (const availabilities of Object.values(allSiteAvail)) {
    let streak = 0
    let found = false
    for (const date of allDates) {
      const key = date.toISOString().replace('.000Z', 'Z')
      if (availabilities[key] === 'Available') {
        streak++
        if (streak >= tripNights) { found = true; break }
      } else {
        streak = 0
      }
    }
    if (found) sitesWithBlock++
  }

  const status =
    sitesWithBlock === 0
      ? 'full'
      : sitesWithBlock <= Math.ceil(totalSites * 0.2)
        ? 'limited'
        : 'available'

  return { status, availableSites: sitesWithBlock, totalSites }
}
