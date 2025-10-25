import { NextResponse } from 'next/server'

function maskDbUrl(url?: string | null): string | undefined {
  if (!url) return undefined
  try {
    if (url.startsWith('file:')) return url
    const u = new URL(url)
    if (u.password) u.password = '***'
    if (u.username) u.username = '***'
    return u.toString()
  } catch {
    return url.length > 12 ? url.slice(0, 12) + '…' : url
  }
}

export async function GET() {
  const db = process.env.DATABASE_URL || ''
  const masked = maskDbUrl(db)
  return NextResponse.json({ status: 'ok', env: process.env.NODE_ENV, db: masked })
}
