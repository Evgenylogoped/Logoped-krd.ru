import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })
  const userId = (session.user as any).id as string
  const { conversationId, durationMs = 3000 } = await req.json()
  if (!conversationId) return new NextResponse('Bad Request', { status: 400 })
  const conv = await (prisma as any).conversation.findFirst({ where: { id: conversationId, participants: { some: { userId } } } })
  if (!conv) return new NextResponse('Not found', { status: 404 })
  const until = new Date(Date.now() + Math.min(10000, Math.max(1000, Number(durationMs))))
  await (prisma as any).conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId } }, data: { typingUntil: until } })
  return NextResponse.json({ ok: true, typingUntil: until.getTime() })
}
