import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: conversationId } = await params
  const session = await getServerSession(authOptions)
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })
  const userId = (session.user as any).id as string
  const conv = await (prisma as any).conversation.findFirst({ where: { id: conversationId, participants: { some: { userId } } }, include: { participants: true } })
  if (!conv) return new NextResponse('Not found', { status: 404 })
  const since = req.nextUrl.searchParams.get('since')
  const sinceDate = since ? new Date(Number(since)) : null
  const msgs = await (prisma as any).message.findMany({
    where: {
      conversationId,
      ...(sinceDate ? {
        OR: [
          { createdAt: { gt: sinceDate } },
          { editedAt: { gt: sinceDate } },
          { deletedAt: { gt: sinceDate } },
        ]
      } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
  })
  // typing indicators
  const me = conv.participants.find((p: any) => p.userId === userId)
  const others = conv.participants.filter((p: any) => p.userId !== userId)
  const now = Date.now()
  const typingUsers = others.filter((p: any) => p.typingUntil && new Date(p.typingUntil).getTime() > now).map((p: any) => p.userId)
  const maxOtherReadAt = others.reduce((acc: number, p: any) => {
    const t = p.lastReadAt ? new Date(p.lastReadAt).getTime() : 0
    return Math.max(acc, t)
  }, 0)
  return NextResponse.json({ messages: msgs, typingUsers, serverTime: Date.now(), lastReadAt: me?.lastReadAt || null, maxOtherReadAt: maxOtherReadAt || null })
}
