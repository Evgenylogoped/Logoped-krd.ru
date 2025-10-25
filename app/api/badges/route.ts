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
      consultIn = await (prisma as any).consultationRequest.count({ where: { subordinateId: userId, status: 'PENDING' } })
      consultOut = await (prisma as any).consultationRequest.count({ where: { supervisorId: userId, status: 'PENDING' } })
      parentActivationsPending = await (prisma as any).activationRequest.count({ where: { targetLogopedId: userId, status: 'PENDING' } })
      parentBookingsActive = await (prisma as any).booking.count({ where: { status: 'ACTIVE', lesson: { logopedId: userId } } })
      transferPending = await ((prisma as any).transferRequest?.count
        ? (prisma as any).transferRequest.count({ where: { toLogopedId: userId, status: 'PENDING' } })
        : Promise.resolve(0))
      const leaderEmail = String((session.user as any).email || '').toLowerCase()
      orgMembershipsPending = leaderEmail
        ? await (prisma as any).organizationMembershipRequest.count({ where: { leaderEmail, status: 'PENDING' } })
        : 0
    }

    const convs = await (prisma as any).conversation.findMany({
      where: { participants: { some: { userId } } },
      select: {
        id: true,
        participants: { where: { userId }, select: { lastReadAt: true } },
        messages: {
          where: { authorId: { not: userId } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true }
        }
      }
    })
    unread = convs.reduce((acc: number, c: any) => {
      const lr = c.participants[0]?.lastReadAt ? new Date(c.participants[0].lastReadAt) : new Date(0)
      const lastOther = c.messages[0]?.createdAt ? new Date(c.messages[0].createdAt) : null
      return acc + (lastOther && lastOther > lr ? 1 : 0)
    }, 0)

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
