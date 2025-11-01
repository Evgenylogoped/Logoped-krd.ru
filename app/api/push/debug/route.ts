import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  try {
    const [subs, queue, logs, prefs] = await Promise.all([
      prisma.webPushSubscription.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, select: { endpoint: true, createdAt: true, updatedAt: true, platform: true, userAgent: true } }),
      prisma.pushEventQueue.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.pushDeliveryLog.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.userNotificationPreference.findUnique({ where: { userId } })
    ])
    return NextResponse.json({
      ok: true,
      subsCount: subs.length,
      subs,
      queue,
      logs,
      prefs,
    })
  } catch (e) {
    const details = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: details }, { status: 500 })
  }
}
