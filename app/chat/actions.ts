"use server"
export const runtime = 'nodejs'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getUserPlan, getLimits } from '@/lib/subscriptions'

function ensure(session: { user?: unknown } | null): asserts session is { user: { id?: string } } {
  if (!session || !('user' in session) || !session.user) throw new Error('Unauthorized')
}

async function getSessionSafe(): Promise<{ user?: { id?: string } } | null> {
  try {
    const na = 'next-auth' as const
    const mod = await import(na as any).catch(() => null as any)
    const auth = await import('@/lib/auth').catch(() => null as any)
    const gss: any = mod?.getServerSession
    const opts = auth?.authOptions
    return (typeof gss === 'function' && opts) ? await gss(opts) : null
  } catch { return null }
}

async function ensureChatAllowed(userId: string) {
  // Родителям чат доступен всегда — вне зависимости от планов/квот
  try {
    const u = await (prisma as any).user.findUnique({ where: { id: userId }, select: { role: true } })
    const role = (u?.role as string | undefined) || ''
    // Разрешаем без ограничений: PARENT, LOGOPED, ADMIN, SUPER_ADMIN
    if (role === 'PARENT' || role === 'LOGOPED' || role === 'ADMIN' || role === 'SUPER_ADMIN') return
  } catch {}
  const plan = await getUserPlan(userId)
  const limits = await getLimits(plan)
  const allowed = Boolean(limits.chat?.enabled)
  if (!allowed) {
    try { await prisma.auditLog.create({ data: { action: 'PLAN_LIMIT_BLOCK', payload: JSON.stringify({ kind: 'chat', userId, plan }) } }) } catch {}
    // Внутри server actions redirect() приводит к 500 при вызове из клиента.
    // Бросаем контролируемую ошибку — клиент поймает и покажет сообщение.
    throw new Error('Чат недоступен: ограничение плана. Перейдите в настройки тарифа.')
  }
}

// Безопасная очистка: удаляет «общие» диалоги без сообщений для пар,
// у которых уже есть хотя бы один детский диалог (title = child:<id>).
// Ничего не трогает, если в общем диалоге есть хотя бы одно сообщение.
export async function cleanupGenericEmptyDuplicates() {
  const session = await getSessionSafe()
  ensure(session)
  const me = String((session!.user as { id?: string }).id || '')
  // Ищем все диалоги пользователя
  const convs = await prisma.conversation.findMany({
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
      const ids = c.participants.map((p: { userId: string }) => p.userId)
      hasChild.add(pairKey(ids))
    }
  }
  // К удалению: общий чат (без child), без сообщений, и для пары есть детский чат
  const toDelete = convs.filter((c: any) => {
    const isGeneric = !c.title || !String(c.title).startsWith('child:')
    if (!isGeneric) return false
    if ((c.messages || []).length > 0) return false
    const ids = c.participants.map((p: { userId: string }) => p.userId)
    return hasChild.has(pairKey(ids))
  })
  for (const c of toDelete) {
    await prisma.conversationParticipant.deleteMany({ where: { conversationId: c.id } })
    await prisma.conversation.delete({ where: { id: c.id } })
  }
  revalidatePath('/chat')
  return { deleted: toDelete.length }
}

export async function reactMessage(messageId: string, reaction: string) {
  const session = await getSessionSafe()
  ensure(session)
  const me = String((session!.user as { id?: string }).id || '')
  const msg = await prisma.message.findUnique({ where: { id: messageId } })
  if (!msg) throw new Error('Сообщение не найдено')
  const conv = await prisma.conversation.findFirst({ where: { id: msg.conversationId, participants: { some: { userId: me } } } })
  if (!conv) throw new Error('Нет доступа')
  let reactions: Record<string, number> = {}
  try {
    const r = msg.reactionsJson as unknown
    if (r && typeof r === 'object') reactions = r as Record<string, number>
  } catch {}
  const key = String(reaction)
  reactions[key] = (reactions[key] || 0) + 1
  await prisma.message.update({ where: { id: messageId }, data: { reactionsJson: reactions, editedAt: new Date() } })
}

export async function editMessage(messageId: string, body: string) {
  const session = await getSessionSafe()
  ensure(session)
  const me = String((session!.user as { id?: string }).id || '')
  const msg = await prisma.message.findUnique({ where: { id: messageId } })
  if (!msg || msg.authorId !== me) throw new Error('Можно редактировать только свои сообщения')
  await prisma.message.update({ where: { id: messageId }, data: { body, editedAt: new Date() } })
}

export async function deleteMessage(messageId: string) {
  const session = await getSessionSafe()
  ensure(session)
  const me = String((session!.user as { id?: string }).id || '')
  const msg = await prisma.message.findUnique({ where: { id: messageId } })
  if (!msg || msg.authorId !== me) throw new Error('Можно удалять только свои сообщения')
  await prisma.message.update({ where: { id: messageId }, data: { body: 'Сообщение удалено', deletedAt: new Date() } })
}

export async function markReadOnFocus(conversationId: string) {
  const session = await getSessionSafe()
  if (!session?.user) return
  const me = String((session.user as { id?: string }).id || '')
  await prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId: me } }, data: { lastReadAt: new Date() } })
  revalidatePath('/chat')
}

export async function getOrCreateConversation(targetUserId: string, childId?: string) {
  const session = await getSessionSafe()
  ensure(session)
  const me = String((session!.user as { id?: string }).id || '')
  await ensureChatAllowed(me)
  const other = String(targetUserId)
  if (me === other) throw new Error('Нельзя создать чат с самим собой')
  let conv
  if (childId) {
    const title = `child:${childId}`
    conv = await prisma.conversation.findFirst({
      where: {
        title,
        AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: other } } } ],
      },
      include: { participants: true },
    })
    if (!conv) {
      conv = await prisma.conversation.create({ data: { title, participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: other, role: 'MEMBER' }] } } })
    }
  } else {
    conv = await prisma.conversation.findFirst({
      where: {
        AND: [
          { participants: { some: { userId: me } } },
          { participants: { some: { userId: other } } },
        ],
      },
      include: { participants: true },
    })
    if (!conv) {
      conv = await prisma.conversation.create({ data: { participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: other, role: 'MEMBER' }] } } })
    }
  }
  return conv
}

export async function listConversationsWithUnread() {
  const session = await getSessionSafe()
  ensure(session)
  const me = String((session!.user as { id?: string }).id || '')
  const convs = await prisma.conversation.findMany({
    where: { participants: { some: { userId: me } } },
    orderBy: { updatedAt: 'desc' },
    include: {
      participants: { include: { user: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
  })
  return convs.map((c: any) => {
    const meP = c.participants.find((p: { userId: string }) => p.userId === me)
    const lastOther = c.messages[0]?.createdAt ? new Date(c.messages[0].createdAt) : null
    const lr = meP?.lastReadAt ? new Date(meP.lastReadAt) : new Date(0)
    const unread = lastOther && lastOther > lr ? 1 : 0
    return { ...c, unread }
  })
}

export async function listMessages(conversationId: string, sinceTs?: number) {
  const session = await getSessionSafe()
  ensure(session)
  const me = String((session!.user as { id?: string }).id || '')
  const conv = await prisma.conversation.findFirst({ where: { id: conversationId, participants: { some: { userId: me } } } })
  if (!conv) throw new Error('Чат не найден')
  const since = sinceTs ? new Date(sinceTs) : null
  const msgs = await prisma.message.findMany({ where: { conversationId, ...(since ? { createdAt: { gt: since } } : {}) }, orderBy: { createdAt: 'asc' }, take: 300 })
  return msgs
}

export async function sendMessageAction(params: { conversationId?: string; targetUserId?: string; body: string; replyToId?: string | null; type?: string; attachmentUrl?: string | null }) {
  try {
    const session = await getSessionSafe()
    if (!session?.user) return { __error: 'Unauthorized' } as any
    const me = String((session.user as { id?: string }).id || '')
    const { conversationId, targetUserId, body, replyToId, type, attachmentUrl } = params
    if ((!conversationId && !targetUserId) || !body) return { __error: 'Неверные параметры' } as any
    // find/create conversation
    let conv: {
      id: string
      title?: string | null
      participants?: { userId: string; role?: string | null }[]
      settings?: { postingPolicy?: string | null; restrictedJson?: unknown } | null
    } | null = null
    if (conversationId) {
      conv = await prisma.conversation.findFirst({ where: { id: conversationId, participants: { some: { userId: me } } }, include: { participants: true, settings: true } })
    } else {
      const other = String(targetUserId)
      conv = await prisma.conversation.findFirst({
        where: { AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: other } } } ] },
        include: { participants: true, settings: true }
      })
      if (!conv) conv = await prisma.conversation.create({ data: { participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: other, role: 'MEMBER' }] } } })
    }
    if (!conv) return { __error: 'Чат недоступен' } as any

    // Базовая проверка подписки на отправку сообщений — без выброса в 500
    try {
      await ensureChatAllowed(me)
    } catch (e) {
      const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as any).message || '') : 'Чат недоступен'
      return { __error: msg } as any
    }
    // Policy enforcement for group chats
    const isGroup = typeof conv.title === 'string' && conv.title.startsWith('group:')
    if (isGroup) {
      const myPart = (conv.participants || []).find((p: { userId: string })=> p.userId === me)
      const myRole = myPart?.role || 'MEMBER'
      // participant state
      const partState = await prisma.conversationParticipantState.findUnique({ where: { conversationId_userId: { conversationId: conv.id, userId: me } } }).catch(()=>null)
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
          const map = st?.restrictedJson as unknown
          if (map && typeof map === 'object' && me in (map as Record<string, unknown>)) {
            if ((map as Record<string, unknown>)[me] === false) allowedByPolicy = false
          }
        } catch {}
      }
      if (!canPostFlag || banned) return { __error: 'Отправка сообщений временно запрещена' } as any
      if (!allowedByPolicy) {
        // Fallback: если это родитель, перенаправим сообщение в персональный чат
        try {
          const u = await (prisma as any).user.findUnique({ where: { id: me }, select: { role: true } })
          if ((u?.role as string | undefined) === 'PARENT') {
            const targetUserId = (() => {
              const parts = (conv.participants || []) as any[]
              const admin = parts.find(p => (p.userId !== me) && ((p.role || '').toUpperCase() === 'ADMIN'))
              if (admin) return admin.userId
              const log = parts.find(p => (p.userId !== me) && ((p.role || '').toUpperCase() === 'LOGOPED'))
              if (log) return log.userId
              const other = parts.find(p => p.userId !== me)
              return other?.userId as string | undefined
            })()
            if (targetUserId) {
              let pconv = await prisma.conversation.findFirst({ where: { AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: targetUserId } } } ] } })
              if (!pconv) pconv = await prisma.conversation.create({ data: { participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: targetUserId, role: 'MEMBER' }] } } })
              await prisma.message.create({ data: { conversationId: pconv.id, authorId: me, body, replyToId: replyToId || null, type: type || 'TEXT', attachmentUrl: attachmentUrl || null } })
              await prisma.conversation.update({ where: { id: pconv.id }, data: { updatedAt: new Date() } })
              await prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId: pconv.id, userId: me } }, data: { lastReadAt: new Date() } })
              return { rerouted: true, conversationId: String(pconv.id) }
            }
          }
        } catch {}
        return { __error: 'Отправка сообщений запрещена настройками группы' } as any
      }
      if (muted && (!params.type || params.type === 'TEXT')) return { __error: 'Вы временно в режиме mute' } as any
    }
    // cleanup >30 days
    const cutoff = new Date(Date.now() - 30*24*60*60*1000)
    await prisma.message.deleteMany({ where: { conversationId: conv.id, createdAt: { lt: cutoff } } })
    const msg = await prisma.message.create({ data: { conversationId: conv.id, authorId: me, body, replyToId: replyToId || null, type: type || 'TEXT', attachmentUrl: attachmentUrl || null } })
    await prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } })
    await prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId: conv.id, userId: me } }, data: { lastReadAt: new Date() } })
    return {
      id: String(msg.id),
      conversationId: String(msg.conversationId),
      authorId: String(msg.authorId),
      body: String(msg.body),
      type: (msg as any).type ? String((msg as any).type) : 'TEXT',
      attachmentUrl: (msg as any).attachmentUrl ? String((msg as any).attachmentUrl) : null,
      replyToId: msg.replyToId ? String(msg.replyToId) : null,
      createdAt: new Date(msg.createdAt).toISOString(),
      editedAt: msg.editedAt ? new Date(msg.editedAt).toISOString() : null,
      deletedAt: msg.deletedAt ? new Date(msg.deletedAt).toISOString() : null,
    }
  } catch (e) {
    try { await prisma.auditLog.create({ data: { action: 'CHAT_SEND_SA_ERR', payload: String((e as any)?.message || e || 'error') } }) } catch {}
    return { __error: 'Ошибка отправки. Попробуйте ещё раз.' } as any
  }
}

export async function markRead(conversationId: string) {
  const session = await getSessionSafe()
  if (!session?.user) return
  const me = String((session.user as { id?: string }).id || '')
  await prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId: me } }, data: { lastReadAt: new Date() } })
}

export async function setTyping(conversationId: string, durationMs = 3000) {
  const session = await getSessionSafe()
  if (!session?.user) return Date.now()
  const me = String((session.user as { id?: string }).id || '')
  const until = new Date(Date.now() + Math.min(10000, Math.max(1000, Number(durationMs))))
  await prisma.conversationParticipant.update({ where: { conversationId_userId: { conversationId, userId: me } }, data: { typingUntil: until } })
  return until.getTime()
}

export async function startChat(formData: FormData) {
  const session = await getSessionSafe()
  ensure(session)
  const me = String((session!.user as { id?: string }).id || '')
  await ensureChatAllowed(me)
  const other = String(formData.get('targetUserId') || '').trim()
  const childId = String(formData.get('childId') || '').trim()
  if (!other) throw new Error('targetUserId отсутствует')
  if (me === other) return redirect('/chat')
  let conv
  if (childId) {
    const title = `child:${childId}`
    conv = await prisma.conversation.findFirst({ where: { title, AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: other } } } ] } })
    if (!conv) conv = await prisma.conversation.create({ data: { title, participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: other, role: 'MEMBER' }] } } })
  } else {
    conv = await prisma.conversation.findFirst({ where: { AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: other } } } ] } })
    if (!conv) conv = await prisma.conversation.create({ data: { participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: other, role: 'MEMBER' }] } } })
  }
  return redirect(`/chat/${conv.id}`)
}
