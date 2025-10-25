// DEPRECATED: This route is no longer used. Limit reviews are handled via server actions
// in app/admin/subscriptions/limit-requests/page.tsx. Keeping a stub to safely return 410.
import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json({ ok: false, error: 'deprecated' }, { status: 410 })
}

export async function GET() {
  return NextResponse.json({ ok: false, error: 'deprecated' }, { status: 410 })
}
