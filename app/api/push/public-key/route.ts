import { NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// Public VAPID key fallback; overridden by env if NEXT_PUBLIC_VAPID_PUBLIC_KEY is set
const FALLBACK_PUBLIC = "BI7-mGiNtz_96OIcs4wAaTbh_SwNw9dEI2o2Ih-42IkRn5kBPYajrn2uES7d1jI2tulFJZQKhXGpVIuzSXUflec"

export async function GET() {
  const key = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim() || FALLBACK_PUBLIC
  return NextResponse.json({ key })
}
