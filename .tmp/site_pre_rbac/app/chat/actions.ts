"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function ensure(session: any) {
  if (!session?.user) throw new Error('Unauthorized')
}

// Безопасная очистка: удаляет «общие» диалоги без сообщений для пар,
// у которых уже есть хотя бы один детский диалог (title = child:<id>).
// Ничего не трогает, если в общем диалоге есть хотя бы одно сообщение.
export async function cleanupGenericEmptyDuplicates() {
  const session = await getServerSession(authOptions)
  ensure(session)
  const me = (session!.user as any).id as string
  // Ищем все диалоги пользователя
  const convs = await (prisma as any).conversation.findMany({
    where: { participants: { some: { userId: me } } },
    include: {
      participants: true,
      messages: { select: { id: true }, take: 1 },
    },
  })
  // Индекс: по паре участников — есть ли детский чат
  const pairKey = (ids: string[]) => ids.sort().join(':')
  const hasChild = new Set<string>()
  for (const c of convs) {
    if (typeof c.title === 'string' && c.title.startsWith('child:')) {
      const ids = c.participants.map((p: any) => p.userId)
      hasChild.add(pairKey(ids))
    }
  }
  // К удалению: общий чат (без child), без сообщений, и для пары есть детский чат
  const toDelete = convs.filter((c: any) => {
    const isGeneric = !c.title || !String(c.title).startsWith('child:')
    if (!isGeneric) return false
    if ((c.messages || []).length > 0) return false
    const ids = c.participants.map((p: any) => p.userId)
    return hasChild.has(pairKey(ids))
  })
  for (const c of toDelete) {
    await (prisma as any).conversationParticipant.deleteMany({ where: { conversationId: c.id } })
    await (prisma as any).conversation.delete({ where: { id: c.id } })
  }
  revalidatePath('/chat')
  return { deleted: toDelete.length }
}

export async function reactMessage(messageId: string, reaction: string) {
  const session = await getServerSession(authOptions)
  ensure(session)
  const me = (session!.user as any).id as string
  const msg = await (prisma as any).message.findUnique({ where: { id: messageId } })
  if (!msg) throw new Error('Сообщение не найдено')
  const conv = await (prisma as any).conversation.findFirst({ where: { id: msg.conversationId, participants: { some: { userId: me } } } })
  if (!conv) throw new Error('Нет доступа')
  let reactions: any = {}
  try { reactions = msg.reactionsJson || {} } catch {}
  const key = String(reaction)
  reactions[key] = (reactions[key] || 0) + 1
  await (prisma as any).message.update({ where: { id: messageId }, data: { reactionsJson: reactions, editedAt: new Date() } })
}

export async function editMessage(messageId: string, body: string) {
  const session = await getServerSession(authOptions)
  ensure(session)
  const me = (session!.user as any).id as string
  const msg = await (prisma as any).message.findUnique({ where: { id: messageId } })
  if (!msg || msg.authorId !== me) throw new Error('Можно редактировать только свои сообщения')
  await (prisma as any).message.update({ where: { id: messageId }, data: { body, editedAt: new Date() } })
}

export async function deleteMessage(messageId: string) {
  const session = await getServerSession(authOptions)
  ensure(session)
  const me = (session!.user as any).id as string
  const msg = await (prisma as any).message.findUnique({ where: { id: messageId } })
  if (!msg || msg.authorId !== me) throw new Error('Можно удалять только свои сообщения')
  await (prisma as any).message.update({ where: { id: messageId }, data: { body: 'Сообщение удалено', deletedAt: new Date() } })
}

export async function markReadOnFocus(conversationId: string) {
  const session = await getServerSession(authOptions)
  ensure(session)
  const me = (session!.user as any).id as string
  await (prisma as any).conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId: me } }, data: { lastReadAt: new Date() } })
  revalidatePath('/chat')
}

export async function getOrCreateConversation(targetUserId: string, childId?: string) {
  const session = await getServerSession(authOptions)
  ensure(session)
  const me = (session!.user as any).id as string
  const other = String(targetUserId)
  if (me === other) throw new Error('Нельзя создать чат с самим собой')
  let conv
  if (childId) {
    const title = `child:${childId}`
    conv = await (prisma as any).conversation.findFirst({
      where: {
        title,
        AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: other } } } ],
      },
      include: { participants: true },
    })
    if (!conv) {
      conv = await (prisma as any).conversation.create({ data: { title, participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: other, role: 'MEMBER' }] } } })
    }
  } else {
    conv = await (prisma as any).conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: me } } },
          { participants: { some: { userId: other } } },
        ],
      },
      include: { participants: true },
    })
    if (!conv) {
      conv = await (prisma as any).conversation.create({ data: { participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: other, role: 'MEMBER' }] } } })
    }
  }
  return conv
}

export async function listConversationsWithUnread() {
  const session = await getServerSession(authOptions)
  ensure(session)
  const me = (session!.user as any).id as string
  const convs = await (prisma as any).conversation.findMany({
    where: { participants: { some: { userId: me } } },
    orderBy: { updatedAt: 'desc' },
    include: {
      participants: { include: { user: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  return convs.map((c: any) => {
    const meP = c.participants.find((p: any) => p.userId === me)
    const lastOther = c.messages[0]?.createdAt ? new Date(c.messages[0].createdAt) : null
    const lr = meP?.lastReadAt ? new Date(meP.lastReadAt) : new Date(0)
    const unread = lastOther && lastOther > lr ? 1 : 0
    return { ...c, unread }
  })
}

export async function listMessages(conversationId: string, sinceTs?: number) {
  const session = await getServerSession(authOptions)
  ensure(session)
  const me = (session!.user as any).id as string
  const conv = await (prisma as any).conversation.findFirst({ where: { id: conversationId, participants: { some: { userId: me } } } })
  if (!conv) throw new Error('Чат не найден')
  const since = sinceTs ? new Date(sinceTs) : null
  const msgs = await (prisma as any).message.findMany({ where: { conversationId, ...(since ? { createdAt: { gt: since } } : {}) }, orderBy: { createdAt: 'asc' }, take: 300 })
  return msgs
}

export async function sendMessageAction(params: { conversationId?: string; targetUserId?: string; body: string; replyToId?: string | null; type?: string; attachmentUrl?: string | null }) {
  const session = await getServerSession(authOptions)
  ensure(session)
  const me = (session!.user as any).id as string
  const { conversationId, targetUserId, body, replyToId, type, attachmentUrl } = params
  if ((!conversationId && !targetUserId) || !body) throw new Error('Неверные параметры')
  // find/create conversation
  let conv: any = null
  if (conversationId) {
    conv = await (prisma as any).conversation.findFirst({ where: { id: conversationId, participants: { some: { userId: me } } }, include: { participants: true, settings: true } })
  } else {
    const other = String(targetUserId)
    conv = await (prisma as any).conversation.findFirst({
      where: { AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: other } } } ] },
      include: { participants: true, settings: true }
    })
    if (!conv) conv = await (prisma as any).conversation.create({ data: { participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: other, role: 'MEMBER' }] } } })
  }
  if (!conv) throw new Error('Чат недоступен')

  // Policy enforcement for group chats
  const isGroup = typeof conv.title === 'string' && conv.title.startsWith('group:')
  if (isGroup) {
    const myPart = (conv.participants || []).find((p: any)=> p.userId === me)
    const myRole = myPart?.role || 'MEMBER'
    // participant state
    const partState = await (prisma as any).conversationParticipantState.findUnique({ where: { conversationId_userId: { conversationId: conv.id, userId: me } } }).catch(()=>null)
    const now = Date.now()
    const banned = partState?.bannedUntil ? new Date(partState.bannedUntil).getTime() > now : false
    const muted = partState?.mutedUntil ? new Date(partState.mutedUntil).getTime() > now : false
    const canPostFlag = partState?.canPost !== false
    // settings
    const st = conv.settings || null
    const policy = st?.postingPolicy || 'ALL'
    let allowedByPolicy = true
    if (policy === 'LOGOPED_ONLY') {
      allowedByPolicy = (myRole === 'ADMIN' || myRole === 'LOGOPED')
    } else if (policy === 'RESTRICTED') {
      // if restrictedJson present and has my id false => block
      try {
        const map = st?.restrictedJson as any
        if (map && typeof map === 'object' && Object.prototype.hasOwnProperty.call(map, me)) {
          if (map[me] === false) allowedByPolicy = false
        }
      } catch {}
    }
    if (!canPostFlag || banned) throw new Error('Отправка сообщений временно запрещена')
    if (!allowedByPolicy) throw new Error('Отправка сообщений запрещена настройками группы')
    if (muted && (!params.type || params.type === 'TEXT')) throw new Error('Вы временно в режиме mute')
  }
  // cleanup >30 days
  const cutoff = new Date(Date.now() - 30*24*60*60*1000)
  await (prisma as any).message.deleteMany({ where: { conversationId: conv.id, createdAt: { lt: cutoff } } })
  const msg = await (prisma as any).message.create({ data: { conversationId: conv.id, authorId: me, body, replyToId: replyToId || null, type: type || 'TEXT', attachmentUrl: attachmentUrl || null } })
  await (prisma as any).conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } })
  await (prisma as any).conversationParticipant.update({ where: { conversationId_userId: { conversationId: conv.id, userId: me } }, data: { lastReadAt: new Date() } })
  revalidatePath('/chat')
  revalidatePath(`/chat/${conv.id}`)
  return msg
}

export async function markRead(conversationId: string) {
  const session = await getServerSession(authOptions)
  ensure(session)
  const me = (session!.user as any).id as string
  await (prisma as any).conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId: me } }, data: { lastReadAt: new Date() } })
}

export async function setTyping(conversationId: string, durationMs = 3000) {
  const session = await getServerSession(authOptions)
  ensure(session)
  const me = (session!.user as any).id as string
  const until = new Date(Date.now() + Math.min(10000, Math.max(1000, Number(durationMs))))
  await (prisma as any).conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId: me } }, data: { typingUntil: until } })
  return until.getTime()
}

export async function startChat(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensure(session)
  const me = (session!.user as any).id as string
  const other = String(formData.get('targetUserId') || '').trim()
  const childId = String(formData.get('childId') || '').trim()
  if (!other) throw new Error('targetUserId отсутствует')
  if (me === other) return redirect('/chat')
  let conv
  if (childId) {
    const title = `child:${childId}`
    conv = await (prisma as any).conversation.findFirst({ where: { title, AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: other } } } ] } })
    if (!conv) conv = await (prisma as any).conversation.create({ data: { title, participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: other, role: 'MEMBER' }] } } })
  } else {
    conv = await (prisma as any).conversation.findFirst({ where: { AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: other } } } ] } })
    if (!conv) conv = await (prisma as any).conversation.create({ data: { participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: other, role: 'MEMBER' }] } } })
  }
  return redirect(`/chat/${conv.id}`)
}
