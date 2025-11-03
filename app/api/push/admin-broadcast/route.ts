import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/push/admin-broadcast
 * Body: {
 *   title: string,
 *   body: string,
 *   url: string,
 *   segment?: { role?: string, city?: string, userIds?: string[] }
 * }
 * Requires user with role ADMIN or SUPER_ADMIN.
 * Enqueues ADMIN_BROADCAST events to matched users (createMany, in batches).
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role as string | undefined
  if (!role || (role !== 'ADMIN' && role !== 'SUPER_ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const { title, body: text, url, segment } = body || {}
  if (!title || !text || !url) return NextResponse.json({ error: 'INVALID', details: 'title, body, url required' }, { status: 400 })

  try {
    // Select users by segment
    const where: any = {}
    if (segment?.role) where.role = segment.role
    if (segment?.city) where.city = segment.city
    if (Array.isArray(segment?.userIds) && segment.userIds.length) where.id = { in: segment.userIds }

    const users = await prisma.user.findMany({ where, select: { id: true } })
    if (!users.length) return NextResponse.json({ ok: true, enqueued: 0 })

    const payload = { title: String(title), body: String(text), url: String(url) }
    const now = new Date()

    // Batch createMany in chunks of 1000
    const chunkSize = 1000
    let total = 0
    for (let i = 0; i < users.length; i += chunkSize) {
      const chunk = users.slice(i, i + chunkSize)
      const data = chunk.map(u => ({ userId: u.id, type: 'ADMIN_BROADCAST' as any, payload, scheduledAt: now, attempt: 0 }))
      const res = await (prisma as any).pushEventQueue.createMany({ data, skipDuplicates: true })
      total += res.count ?? chunk.length
    }

    // Best-effort immediate dispatch (local URL to pass isLocal check)
    try {
      await fetch('http://127.0.0.1:3000/api/push/dispatch', { method: 'POST' })
    } catch {}

    return NextResponse.json({ ok: true, enqueued: total })
  } catch (e) {
    const details = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'DB_ERROR', details }, { status: 500 })
  }
}
