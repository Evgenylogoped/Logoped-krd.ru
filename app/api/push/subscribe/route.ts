import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  let json: any
  try { json = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const { endpoint, keys, userAgent, platform } = json || {}
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  }
  try {
    // Upsert by endpoint
    await (prisma as any).webPushSubscription.upsert({
      where: { endpoint },
      update: { userId, p256dh: String(keys.p256dh), auth: String(keys.auth), userAgent: String(userAgent||'') || null, platform: String(platform||'') || null },
      create: { endpoint, userId, p256dh: String(keys.p256dh), auth: String(keys.auth), userAgent: String(userAgent||'') || null, platform: String(platform||'') || null },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('push/subscribe DB error:', e)
    const details = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'DB_ERROR', details }, { status: 500 })
  }
}
