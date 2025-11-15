import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only admin/super_admin can access this endpoint
  const user = await prisma.user.findUnique({ where: { id: session.user.id } })
  if (!user || (user.role !== 'ADMIN' && user.role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const total = await (prisma as any).pushEventQueue.count()
    const events = await (prisma as any).pushEventQueue.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        userId: true,
        type: true,
        scheduledAt: true,
        attempt: true,
        nextRetryAt: true,
        createdAt: true,
      }
    })

    return NextResponse.json({
      total,
      events: events.map(e => ({
        ...e,
        scheduledAt: e.scheduledAt?.toISOString(),
        nextRetryAt: e.nextRetryAt?.toISOString(),
        createdAt: e.createdAt?.toISOString(),
      }))
    })
  } catch (e) {
    const details = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'DB_ERROR', details }, { status: 500 })
  }
}
