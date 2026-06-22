import { NextResponse } from 'next/server'
import { geocodeLocation } from '@/lib/geocode'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get('q')

  if (!query?.trim()) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 })
  }

  const result = await geocodeLocation(query)

  if (!result) {
    return NextResponse.json({ error: 'Location not found in Colorado' }, { status: 404 })
  }

  return NextResponse.json(result)
}
