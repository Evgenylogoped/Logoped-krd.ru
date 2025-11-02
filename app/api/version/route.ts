import { NextResponse } from 'next/server'

export const runtime = 'edge'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ version: 'admin-push-ui v2025-11-02-17:07 V2' })
}
