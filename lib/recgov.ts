const RIDB_BASE = 'https://ridb.recreation.gov/api/v1'
const AVAIL_BASE = 'https://www.recreation.gov/api/camps/availability/campground'

function getApiKey(): string {
  const key = process.env.RECGOV_API_KEY
  if (!key) throw new Error('RECGOV_API_KEY is not set. Copy .env.local.example to .env.local and add your key from ridb.recreation.gov')
  return key
}

export interface RIDBFacility {
  FacilityID: string
  FacilityName: string
  FacilityDescription: string
  FacilityPhone: string
  FacilityLatitude: number
  FacilityLongitude: number
  FacilityTypeDescription: string
  FacilityReservationURL: string
  ACTIVITY: Array<{ ActivityName: string }>
  FACILITYADDRESS: Array<{ City: string; StateCode: string; PostalCode: string }>
}

export interface AvailabilityResult {
  status: 'available' | 'limited' | 'full' | 'unknown'
  availableSites: number
  totalSites: number
}

export async function searchCampgrounds(
  lat: number,
  lng: number,
  radiusMiles: number
): Promise<RIDBFacility[]> {
  const params = new URLSearchParams({
    activity: '9',  // Camping
    latitude: lat.toString(),
    longitude: lng.toString(),
    radius: radiusMiles.toString(),
    limit: '50',
    full: 'true',
    apikey: getApiKey(),
  })

  const res = await fetch(`${RIDB_BASE}/facilities?${params}`, {
    next: { revalidate: 3600 },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`RIDB API error ${res.status}: ${text.slice(0, 200)}`)
  }

  const data = await res.json()
  return (data.RECDATA || []).filter(
    (f: RIDBFacility) => f.FacilityLatitude && f.FacilityLongitude
  )
}

export async function getCampgroundAvailability(
  facilityId: string,
  startDate: Date,
  endDate: Date
): Promise<AvailabilityResult> {
  const months = getMonthsInRange(startDate, endDate)
  const allSiteAvailability: Record<string, Record<string, string>> = {}

  await Promise.allSettled(
    months.map(async (monthStart) => {
      try {
        const url = `${AVAIL_BASE}/${facilityId}/month?start_date=${encodeURIComponent(monthStart.toISOString())}`
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Referer': 'https://www.recreation.gov/',
          },
          signal: AbortSignal.timeout(7000),
          next: { revalidate: 900 },
        })
        if (!res.ok) return

        const data = await res.json()
        for (const [siteId, siteData] of Object.entries(data.campsites as Record<string, { availabilities: Record<string, string> }>)) {
          if (!allSiteAvailability[siteId]) allSiteAvailability[siteId] = {}
          Object.assign(allSiteAvailability[siteId], siteData.availabilities)
        }
      } catch {
        // Skip failed month — availability will show as unknown
      }
    })
  )

  const totalSites = Object.keys(allSiteAvailability).length
  if (totalSites === 0) return { status: 'unknown', availableSites: 0, totalSites: 0 }

  const datesToCheck = getDatesInRange(startDate, endDate)
  let availableSites = 0

  for (const availabilities of Object.values(allSiteAvailability)) {
    const fullyAvailable = datesToCheck.every((date) => {
      const key = date.toISOString().replace('.000Z', 'Z')
      return availabilities[key] === 'Available'
    })
    if (fullyAvailable) availableSites++
  }

  let status: AvailabilityResult['status']
  if (availableSites === 0) status = 'full'
  else if (availableSites <= Math.ceil(totalSites * 0.2)) status = 'limited'
  else status = 'available'

  return { status, availableSites, totalSites }
}

function getMonthsInRange(start: Date, end: Date): Date[] {
  const months: Date[] = []
  const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  const endMonth = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1))

  while (current <= endMonth) {
    months.push(new Date(current))
    current.setUTCMonth(current.getUTCMonth() + 1)
  }

  return months
}

function getDatesInRange(start: Date, end: Date): Date[] {
  const dates: Date[] = []
  const current = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()))
  const endUTC = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()))

  while (current < endUTC) {
    dates.push(new Date(current))
    current.setUTCDate(current.getUTCDate() + 1)
  }

  return dates
}
