import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import ChatRoom from '../ChatRoom'
import Link from 'next/link'

export default async function ChatRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return <div className="container py-6">Доступ запрещён</div>
  const selfId = (session.user as any).id as string
  const { id: conversationId } = await params
  // First, load conversation by id (even if participant row is missing after DB reset)
  let conv = await (prisma as any).conversation.findUnique({ where: { id: conversationId }, include: { participants: { include: { user: true } }, settings: true } })
  if (!conv) return <div className="container py-6">Чат не найден</div>
  // Ensure current user is a participant to avoid errors in read/typing actions
  const meIsParticipant = (conv.participants || []).some((p: any) => p.userId === selfId)
  if (!meIsParticipant) {
    try {
      await (prisma as any).conversationParticipant.create({ data: { conversationId, userId: selfId, role: 'MEMBER' } })
      conv = await (prisma as any).conversation.findUnique({ where: { id: conversationId }, include: { participants: { include: { user: true } }, settings: true } })
    } catch {}
  }
  const initial = await (prisma as any).message.findMany({ where: { conversationId }, orderBy: { createdAt: 'asc' }, take: 200 })
  // child header
  let childInfo: { id: string; name: string; image?: string | null } | null = null
  if (conv?.title && typeof conv.title === 'string' && conv.title.startsWith('child:')) {
    const childId = conv.title.slice('child:'.length)
    if (childId) {
      const ch = await (prisma as any).child.findUnique({ where: { id: childId } })
      if (ch) childInfo = { id: ch.id, name: `${ch.lastName} ${ch.firstName}`.trim(), image: ch.photoUrl }
    }
  }
  const isGroup = conv?.title && String(conv.title).startsWith('group:')
  const mePart = (conv.participants || []).find((p:any)=> p.userId===selfId)
  const isAdmin = mePart && (mePart.role==='ADMIN' || mePart.role==='LOGOPED')
  const groupHeader = isGroup ? (
    <div className="flex items-center justify-between p-3 rounded border" style={{ background: 'var(--card-bg)' }}>
      <div className="flex items-center gap-3">
        <img src={'/icons/group.png'} alt="Группа" className="w-10 h-10 rounded-md object-cover" />
        <div className="min-w-0">
          <div className="text-sm text-muted">Групповой чат</div>
          <div className="font-medium leading-tight truncate">Родители активных детей</div>
          <div className="text-xs text-muted">Участников: {(conv.participants||[]).length}</div>
        </div>
      </div>
      {isAdmin && (
        <Link href={`/chat/${conversationId}/settings`} className="btn btn-sm" title="Настройки">
          ⚙️
        </Link>
      )}
    </div>
  ) : null
  return (
    <div className="container py-6 space-y-3">
      {childInfo ? (
        <div className="flex items-center gap-3 p-3 rounded border" style={{ background: 'var(--card-bg)' }}>
          <img src={childInfo.image || '/avatar-child.svg'} alt={childInfo.name} className="w-10 h-10 rounded-md object-cover" />
          <div className="min-w-0">
            <div className="text-sm text-muted">Диалог по ребёнку</div>
            <div className="font-medium leading-tight truncate">{childInfo.name}</div>
          </div>
        </div>
      ) : groupHeader}
      <ChatRoom conversationId={conversationId} selfId={selfId} initialMessages={initial} childInfo={childInfo || undefined} backgroundColor={conv.settings?.backgroundColor || undefined} backgroundUrl={conv.settings?.backgroundUrl || undefined} />
    </div>
  )
}
