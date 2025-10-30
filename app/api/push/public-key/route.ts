import { NextResponse } from 'next/server'
import { VAPID_PUBLIC } from '@/lib/webpush'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Temporary fallback embeds current public key if env not set
const FALLBACK_PUBLIC = 'BI7-mGiNtz_96OIcs4wAaTbh_SwNw9dEI2o2Ih-42IkRn5kBPYajrn2uES7d1jI2tulFJZQKhXGpVIuzSXUflec'

export async function GET() {
  const key = (VAPID_PUBLIC && VAPID_PUBLIC.trim()) || FALLBACK_PUBLIC
  return NextResponse.json({ key })
}
