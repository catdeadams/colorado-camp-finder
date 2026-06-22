import { NextResponse } from 'next/server'
import { readWatches, addWatch, removeWatch } from '@/lib/db'

export async function GET() {
  const watches = readWatches().filter((w) => w.isActive)
  return NextResponse.json({ watches })
}

export async function POST(request: Request) {
  const body = await request.json()
  const { campgroundId, campgroundName, campgroundSource, reserveUrl, lat, lng, startDate, endDate, email } = body

  if (!campgroundId || !campgroundName || !email || !startDate || !endDate) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
  }

  const watch = addWatch({
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
  removeWatch(id)
  return NextResponse.json({ ok: true })
}
