import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const { userId, type, payload, scheduledAt } = body || {}
  if (!userId || !type || !payload) {
    return NextResponse.json({ error: 'INVALID', details: 'userId,type,payload required' }, { status: 400 })
  }

  try {
    await (prisma as any).pushEventQueue.create({
      data: {
        userId: String(userId),
        type: String(type),
        payload: payload as any,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : new Date(),
      },
    })
    // fire-and-forget immediate dispatch to reduce latency
    try {
      const cronKey = (process.env.CRON_PUSH_KEY || '').trim()
      const origin = req.headers.get('origin') || `${req.nextUrl.protocol}//${req.nextUrl.host}`
      if (cronKey && origin && origin.startsWith('http')) {
        // best-effort, do not await
        fetch(`${origin}/api/push/dispatch`, { method: 'POST', headers: { 'X-CRON-KEY': cronKey } }).catch(() => {})
      }
    } catch {}
    return NextResponse.json({ ok: true })
  } catch (e) {
    const details = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'DB_ERROR', details }, { status: 500 })
  }
}
