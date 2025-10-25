import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session) return new NextResponse('Unauthorized', { status: 401 })
  const userId = (session.user as any).id as string
  let inCnt = 0, outCnt = 0, parentAct = 0
  let unread = 0
  const dbUser = await prisma.user.findUnique({ where: { id: userId } })
  const lastSeen = (dbUser as any)?.lastNotificationsSeenAt ? new Date((dbUser as any).lastNotificationsSeenAt) : new Date(0)
  if (['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role)) {
    // Непрочитанные входящие консультации: новые после lastSeen
    inCnt = await (prisma as any).consultationRequest.count({ where: { subordinateId: userId, status: 'PENDING', createdAt: { gt: lastSeen } } })
    // Исходящие для бейджа на расписании — оставляем как общее количество ожидающих
    outCnt = await (prisma as any).consultationRequest.count({ where: { supervisorId: userId, status: 'PENDING' } })
    // Непрочитанные заявки активации родителей: новые после lastSeen
    parentAct = await (prisma as any).activationRequest.count({ where: { targetLogopedId: userId, status: 'PENDING', createdAt: { gt: lastSeen } } })
  }
  // unread chat messages: messages where participant is current user and message.createdAt > participant.lastReadAt and author != user
  const convs = await (prisma as any).conversation.findMany({
    where: { participants: { some: { userId } } },
    select: { id: true, participants: { where: { userId }, select: { lastReadAt: true } }, messages: { where: { authorId: { not: userId } }, orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } } }
  })
  unread = convs.reduce((acc: number, c: any) => {
    const lr = c.participants[0]?.lastReadAt ? new Date(c.participants[0].lastReadAt) : new Date(0)
    const lastOther = c.messages[0]?.createdAt ? new Date(c.messages[0].createdAt) : null
    return acc + (lastOther && lastOther > lr ? 1 : 0)
  }, 0)
  return NextResponse.json({ consultIn: inCnt, consultOut: outCnt, parentActivations: parentAct, unread })
}
