import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ version: 'admin-push-ui v2025-11-02-23:58 V3' })
}
