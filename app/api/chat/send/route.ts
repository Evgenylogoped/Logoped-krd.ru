import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'nodejs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })
  const userId = (session.user as any).id as string
  const { conversationId, targetUserId, body, replyToId } = await req.json()
  if ((!conversationId && !targetUserId) || !body) return new NextResponse('Bad Request', { status: 400 })

  // get or create conversation
  let conv: any = null
  if (conversationId) {
    conv = await (prisma as any).conversation.findFirst({ where: { id: conversationId, participants: { some: { userId } } }, include: { participants: true } })
    if (!conv) return new NextResponse('Not found', { status: 404 })
  } else {
    // two-party conversation
    const otherId = String(targetUserId)
    conv = await (prisma as any).conversation.findFirst({ where: { AND: [ { participants: { some: { userId } } }, { participants: { some: { userId: otherId } } } ] }, include: { participants: true } })
    if (!conv) {
      conv = await (prisma as any).conversation.create({ data: { participants: { create: [{ userId, role: 'MEMBER' }, { userId: otherId, role: 'MEMBER' }] } } })
    }
  }

  // retention: delete messages older than 30 days
  const cutoff = new Date(Date.now() - 30*24*60*60*1000)
  await (prisma as any).message.deleteMany({ where: { conversationId: conv.id, createdAt: { lt: cutoff } } })

  try {
    const msg = await (prisma as any).message.create({ data: { conversationId: conv.id, authorId: userId, body: String(body), replyToId: replyToId || null } })
    await (prisma as any).conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } })
    // mark my lastReadAt (best-effort)
    try { await (prisma as any).conversationParticipant.update({ where: { conversationId_userId: { conversationId: conv.id, userId } }, data: { lastReadAt: new Date() } }) } catch {}
    try { await prisma.auditLog.create({ data: { action: 'CHAT_SEND_API', payload: JSON.stringify({ conversationId: conv.id, userId, len: String(body||'').length }) , actorId: userId } }) } catch {}
    return NextResponse.json({ ok: true, message: msg })
  } catch (e: any) {
    try { await prisma.auditLog.create({ data: { action: 'CHAT_SEND_API_ERR', payload: String(e?.message||e||'error') , actorId: userId } }) } catch {}
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
