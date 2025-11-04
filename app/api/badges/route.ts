import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function withRetry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 200): Promise<T> {
  let lastErr: any
  for (let i = 0; i < attempts; i++) {
    try { return await fn() } catch (e) {
      lastErr = e
      if (i === attempts - 1) break
      await new Promise(r => setTimeout(r, delayMs))
      delayMs = Math.min(delayMs * 2, 1500)
    }
  }
  throw lastErr
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role as string | undefined
  if (!session) return new NextResponse('Unauthorized', { status: 401 })
  const userId = (session.user as any).id as string

  return withRetry(async () => {
    let consultIn = 0, consultOut = 0, parentActivationsPending = 0
    let parentBookingsActive = 0, transferPending = 0, orgMembershipsPending = 0
    let unread = 0

    if (['LOGOPED','ADMIN','SUPER_ADMIN'].includes((role || '').toString())) {
      const leaderEmail = String((session.user as any).email || '').toLowerCase()
      const [ci, co, act, book, transf, orgm] = await Promise.all([
        (prisma as any).consultationRequest.count({ where: { subordinateId: userId, status: 'PENDING' } }),
        (prisma as any).consultationRequest.count({ where: { supervisorId: userId, status: 'PENDING' } }),
        (prisma as any).activationRequest.count({ where: { targetLogopedId: userId, status: 'PENDING' } }),
        (prisma as any).booking.count({ where: { status: 'ACTIVE', lesson: { logopedId: userId } } }),
        ((prisma as any).transferRequest?.count
          ? (prisma as any).transferRequest.count({ where: { toLogopedId: userId, status: 'PENDING' } })
          : Promise.resolve(0)),
        leaderEmail
          ? (prisma as any).organizationMembershipRequest.count({ where: { leaderEmail, status: 'PENDING' } })
          : Promise.resolve(0),
      ])
      consultIn = ci; consultOut = co; parentActivationsPending = act; parentBookingsActive = book; transferPending = transf; orgMembershipsPending = orgm as number
    }

    // Fast unread calculation using indexes
    const parts = await (prisma as any).conversationParticipant.findMany({
      where: { userId },
      select: { conversationId: true, lastReadAt: true },
    })
    if (parts.length > 0) {
      const convIds = parts.map((p: any) => p.conversationId)
      const groups = await (prisma as any).message.groupBy({
        by: ['conversationId'],
        where: { conversationId: { in: convIds }, authorId: { not: userId } },
        _max: { createdAt: true },
      })
      const lastByConv = new Map<string, Date>()
      for (const g of groups) {
        const d = g._max?.createdAt ? new Date(g._max.createdAt) : null
        if (d) lastByConv.set(g.conversationId, d)
      }
      unread = parts.reduce((acc: number, p: any) => {
        const lr = p.lastReadAt ? new Date(p.lastReadAt) : new Date(0)
        const lastOther = lastByConv.get(p.conversationId)
        return acc + (lastOther && lastOther > lr ? 1 : 0)
      }, 0)
    }

    const total = consultIn + parentActivationsPending + parentBookingsActive + transferPending + orgMembershipsPending
    return NextResponse.json({
      consultIn,
      consultOut,
      parentActivations: parentActivationsPending,
      parentBookingsActive,
      transferPending,
      orgMembershipsPending,
      total,
      unread,
    })
  })
}
