import { NextResponse } from 'next/server'
import { addWatch, removeWatch } from '@/lib/db'

// No GET handler: listing watches would expose every watcher's email address,
// and there are no accounts to scope it to. Watches are write/delete only.

export async function POST(request: Request) {
  const body = await request.json()
  const { campgroundId, campgroundName, campgroundSource, reserveUrl, lat, lng, startDate, endDate, email } = body

  if (!campgroundId || !campgroundName || !email || !startDate || !endDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const watch = await addWatch({
    campgroundId,
    campgroundName,
    campgroundSource: campgroundSource || 'recgov',
    reserveUrl,
    lat: lat ?? 0,
    lng: lng ?? 0,
    startDate,
    endDate,
    email,
  })

  return NextResponse.json({ watch })
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  await removeWatch(id)
  return NextResponse.json({ ok: true })
}
