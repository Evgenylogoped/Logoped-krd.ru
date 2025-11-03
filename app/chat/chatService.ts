import { prisma } from '@/lib/prisma'

// Types for unified conversation and connection views
export type UnifiedConversation = {
  id: string
  otherUser: { id: string; name?: string | null; email?: string | null; image?: string | null; role?: string | null; featured?: boolean | null; featuredSuper?: boolean | null }
  child?: { id: string; name: string; photoUrl?: string | null }
  last?: { id: string; body: string | null; createdAt: Date | string; authorId?: string; authorName?: string | null }
  unread: number
}

export type ConnectionItem = {
  key: string
  href: string
  title: string
  subtitle?: string
  image?: string | null
  unread: number
  role?: string | null
  featured?: boolean | null
  featuredSuper?: boolean | null
}

// Helpers
function isChildTitle(title?: string | null) {
  return !!title && typeof title === 'string' && title.startsWith('child:')
}
function childIdFromTitle(title?: string | null) {
  if (!isChildTitle(title || undefined)) return null
  return String(title).slice('child:'.length)
}

export async function getOrCreateConversation(me: string, other: string, childId?: string) {
  if (me === other) throw new Error('self chat not allowed')
  if (childId) {
    const title = `child:${childId}`
    let conv = await prisma.conversation.findFirst({ where: { title, AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: other } } } ] } })
    if (!conv) conv = await prisma.conversation.create({ data: { title, participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: other, role: 'MEMBER' }] } } })
    return conv
  }
  let conv = await prisma.conversation.findFirst({ where: { AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: other } } } ] } })
  if (!conv) conv = await prisma.conversation.create({ data: { participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: other, role: 'MEMBER' }] } } })
  return conv
}

export async function countUnreadFor(me: string, convId: string) {
  const meP = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: convId, userId: me } } })
  const lr = meP?.lastReadAt ? new Date(meP.lastReadAt) : new Date(0)
  const unread = await prisma.message.count({ where: { conversationId: convId, authorId: { not: me }, createdAt: { gt: lr } } })
  return unread
}

// Returns deduplicated list of conversations. If child chats exist between a pair, only child chats are returned.
export async function listUnifiedConversations(me: string): Promise<UnifiedConversation[]> {
  const convs = await prisma.conversation.findMany({
    where: { participants: { some: { userId: me } } },
    orderBy: { updatedAt: 'desc' },
    include: {
      participants: { include: { user: true } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { author: true } },
    },
  })
  // group by participant pair
  const pairKey = (c: { participants: { userId: string }[] }) => c.participants.map((p: any) => p.userId).sort().join(':')
  const grouped = new Map<string, (typeof convs)[number][]>()
  for (const c of convs) {
    const k = pairKey(c)
    if (!grouped.has(k)) grouped.set(k, [])
    grouped.get(k)!.push(c)
  }
  const dedup: (typeof convs)[number][] = []
  for (const arr of grouped.values()) {
    const childConvs = arr.filter((x: any)=> isChildTitle(x.title))
    if (childConvs.length > 0) {
      dedup.push(...childConvs)
    } else {
      // Оставляем только один общий диалог — самый свежий по updatedAt
      const latest = arr.slice().sort((a: any,b: any)=> new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
      if (latest) dedup.push(latest)
    }
  }
  // build child map
  const childIds = Array.from(new Set(dedup.map((c: any)=> childIdFromTitle(c.title)).filter(Boolean))) as string[]
  const children = childIds.length>0 ? await prisma.child.findMany({ where: { id: { in: childIds } }, select: { id: true, firstName: true, lastName: true, photoUrl: true } }) : []
  const childById = new Map<string, { id: string; firstName: string | null; lastName: string | null; photoUrl: string | null }>(children.map((c: any)=> [c.id, c]))

  const out: UnifiedConversation[] = []
  for (const c of dedup) {
    const other = c.participants.find((p: any)=> p.userId !== me)?.user
    const unread = await countUnreadFor(me, c.id)
    const cid = childIdFromTitle(c.title)
    const kid = cid ? childById.get(cid) : null
    out.push({
      id: c.id,
      otherUser: { id: other?.id, name: other?.name, email: other?.email, image: other?.image, role: other?.role, featured: (other as { featured?: boolean | null } | undefined)?.featured ?? false, featuredSuper: (other as { featuredSuper?: boolean | null } | undefined)?.featuredSuper ?? false },
      child: kid ? { id: String(kid?.id), name: `${kid?.lastName ?? ''} ${kid?.firstName ?? ''}`.trim(), photoUrl: kid?.photoUrl } : undefined,
      last: c.messages[0] ? { id: c.messages[0].id, body: c.messages[0].body, createdAt: c.messages[0].createdAt, authorId: c.messages[0].authorId, authorName: (c.messages[0] as { author?: { name?: string | null; email?: string | null } }).author?.name || (c.messages[0] as { author?: { name?: string | null; email?: string | null } }).author?.email || null } : undefined,
      unread,
    })
  }
  return out
}

export async function countTotalUnread(me: string) {
  // Count messages not authored by me, in conversations where I participate,
  // and with createdAt greater than my lastReadAt for that conversation.
  const rows = await (prisma as any).$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*)::bigint AS count
    FROM "Message" m
    WHERE m."authorId" <> ${me}
      AND EXISTS (
        SELECT 1
        FROM "ConversationParticipant" cp
        WHERE cp."conversationId" = m."conversationId"
          AND cp."userId" = ${me}
          AND (cp."lastReadAt" IS NULL OR m."createdAt" > cp."lastReadAt")
      )
  `
  const cnt = Array.isArray(rows) && rows[0] ? Number(rows[0].count || 0) : 0
  return cnt
}

// Ensure a group conversation for a logoped and keep it in sync with active children parents
export async function ensureLogopedGroup(logopedUserId: string) {
  const title = `group:logoped:${logopedUserId}`
  let conv = await prisma.conversation.findFirst({ where: { title }, include: { participants: true } })
  if (!conv) {
    conv = await prisma.conversation.create({ data: { title, participants: { create: [{ userId: logopedUserId, role: 'ADMIN' }] } } })
  }
  // ensure default settings exist
  await prisma.conversationSettings.upsert({
    where: { conversationId: conv.id },
    update: {},
    create: { conversationId: conv.id, postingPolicy: 'ALL' }
  })
  const kids = await prisma.child.findMany({ where: { logopedId: logopedUserId, isArchived: false }, include: { parent: { include: { user: true } } } })
  const required = new Set<string>([logopedUserId])
  for (const k of kids) { const uid = k.parent?.user?.id; if (uid) required.add(uid) }
  const have = new Set<string>((conv.participants || []).map((p) => p.userId))
  const added: string[] = []
  const removed: string[] = []
  for (const uid of required) if (!have.has(uid)) await prisma.conversationParticipant.create({ data: { conversationId: conv.id, userId: uid, role: uid===logopedUserId?'ADMIN':'MEMBER' } })
  for (const p of (conv.participants || [])) if (p.userId !== logopedUserId && !required.has(p.userId)) await prisma.conversationParticipant.delete({ where: { conversationId_userId: { conversationId: conv.id, userId: p.userId } } })
  // recompute to detect deltas for messages
  const after = await prisma.conversation.findUnique({ where: { id: conv.id }, include: { participants: { include: { user: true } } } })
  for (const uid of required) if (!have.has(uid)) added.push(uid)
  for (const uid of have) if (uid !== logopedUserId && !required.has(uid)) removed.push(uid)
  const shortName = (u: { name?: string | null; email?: string | null } | null | undefined)=> (u?.name || u?.email || 'участник')
  for (const uid of added) {
    const u = (after?.participants||[]).find((p: any)=>p.userId===uid)?.user || null
    await prisma.message.create({ data: { conversationId: conv.id, authorId: logopedUserId, type: 'SYSTEM', body: `Добавлен участник: ${shortName(u)}` } })
  }
  for (const uid of removed) {
    const uName = shortName((conv.participants||[]).find((p: any)=>p.userId===uid)?.user as { name?: string | null; email?: string | null } | null | undefined)
    await prisma.message.create({ data: { conversationId: conv.id, authorId: logopedUserId, type: 'SYSTEM', body: `Исключён участник: ${uName}` } })
  }
  return conv.id as string
}

export async function getLogopedGroupId(logopedUserId: string) {
  const title = `group:logoped:${logopedUserId}`
  const conv = await prisma.conversation.findFirst({ where: { title }, select: { id: true } })
  return conv?.id as string | undefined
}

export async function listConnections(
  me: string,
  role: string,
  opts?: {
    adminFilter?: 'logopeds' | 'managers'
    search?: { q?: string; city?: string; orgId?: string }
    pagination?: { page?: number; perPage?: number }
  }
) {
  const groups: { title: string; items: ConnectionItem[] }[] = []
  const meUser = await prisma.user.findUnique({ where: { id: me }, include: { branch: { include: { manager: true, company: true } }, managedBranches: { include: { manager: true, users: true } } } })
  // глобальная дедупликация по собеседнику
  const seen = new Set<string>()
  function extractToId(href: string): string | null {
    try {
      const u = new URL(href, 'http://local')
      const to = u.searchParams.get('to')
      if (to) return to
      // fallback: /chat/<id>
      const m = href.match(/\/chat\/(.+)$/)
      return m ? m[1] : null
    } catch { return null }
  }
  function addGroup(title: string, items: ConnectionItem[]) {
    const filtered: ConnectionItem[] = []
    for (const it of items) {
      const to = extractToId(it.href)
      if (!to || to === me) continue
      if (seen.has(to)) continue
      seen.add(to)
      filtered.push(it)
    }
    if (filtered.length > 0) groups.push({ title, items: filtered })
  }
  if (role === 'PARENT') {
    const parent = await prisma.parent.findUnique({ where: { userId: me }, include: { children: { include: { logoped: true } } } })
    const childIds = (parent?.children || []).map((c: any)=>c.id)
    const kids = childIds.length>0 ? await prisma.child.findMany({ where: { id: { in: childIds } }, select: { id:true, firstName:true, lastName:true, photoUrl:true, logopedId:true } }) : []
    const items: ConnectionItem[] = []
    for (const k of kids) {
      if (!k.logopedId) continue
      const log = (parent!.children.find((c: any)=>c.id===k.id))?.logoped
      const conv = await getOrCreateConversation(me, k.logopedId, k.id)
      const unread = await countUnreadFor(me, conv.id)
      items.push({ key: `${k.logopedId}:${k.id}`, href: `/chat/${conv.id}`, title: `${k.lastName} ${k.firstName}`.trim(), subtitle: log?.name || log?.email, image: k.photoUrl || '/avatar-child.svg', unread, featured: (log as { featured?: boolean | null } | null | undefined)?.featured ?? false, featuredSuper: (log as { featuredSuper?: boolean | null } | null | undefined)?.featuredSuper ?? false, role: log?.role })
    }
    addGroup('Логопеды детей', items)
    // Добавим групповую беседу(ы) логопедов
    try {
      const logIds = Array.from(new Set((kids || []).map((k: any)=> k.logopedId).filter(Boolean))) as string[]
      const groupItems: ConnectionItem[] = []
      for (const lid of logIds) {
        try { await ensureLogopedGroup(lid) } catch {}
        const gid = await getLogopedGroupId(lid)
        if (gid) groupItems.push({ key: `grp:${lid}`, href: `/chat/${gid}`, title: 'Группа: родители активных детей', subtitle: 'Групповой чат логопеда', image: '/icons/group.png', unread: await countUnreadFor(me, gid) })
      }
      if (groupItems.length) addGroup('Групповые чаты', groupItems)
    } catch {}
  }
  if (role === 'LOGOPED') {
    const kids = await prisma.child.findMany({ where: { logopedId: me, isArchived:false }, include: { parent: { include: { user: true } } } })
    const items: ConnectionItem[] = []
    for (const k of kids) {
      const parentUser = k.parent?.user
      if (!parentUser) continue
      const conv = await getOrCreateConversation(me, parentUser.id, k.id)
      const unread = await countUnreadFor(me, conv.id)
      items.push({ key: `${parentUser.id}:${k.id}`, href: `/chat/${conv.id}`, title: `${k.lastName} ${k.firstName}`.trim(), subtitle: parentUser.name || parentUser.email, image: k.photoUrl || '/avatar-child.svg', unread, role: parentUser.role, featured: (parentUser as { featured?: boolean | null } | null)?.featured ?? false, featuredSuper: (parentUser as { featuredSuper?: boolean | null } | null)?.featuredSuper ?? false })
    }
    addGroup('Родители детей', items)
    // Добавить руководителя филиала
    const bm = meUser?.branch?.manager
    const isAdminRoleLocal = (r?: string|null) => r === 'ADMIN' || r === 'SUPER_ADMIN' || r === 'ACCOUNTANT'
    if (bm && bm.id !== me && !isAdminRoleLocal(bm.role)) {
      const conv = await getOrCreateConversation(me, bm.id)
      addGroup('Руководители', [ { key: `sup:${bm.id}`, href: `/chat/${conv.id}` , title: String(bm.name || bm.email || ''), subtitle: 'Руководитель филиала', image: bm.image, unread: await countUnreadFor(me, conv.id), role: bm.role, featured: (bm as { featured?: boolean | null })?.featured ?? false, featuredSuper: (bm as { featuredSuper?: boolean | null })?.featuredSuper ?? false } ])
    }
  }
  // Админские глобальные списки по фильтру
  if ((role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTANT') && opts?.adminFilter) {
    const page = Math.max(1, Number(opts?.pagination?.page) || 1)
    const perPage = Math.max(1, Math.min(100, Number(opts?.pagination?.perPage) || 10))
    const { q, city, orgId } = opts.search || {}
    if (opts.adminFilter === 'logopeds') {
      const where: any = { role: 'LOGOPED', id: { not: me } }
      if (q && q.trim()) {
        where.OR = [
          { name: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
        ]
      }
      if (city && city.trim()) where.city = { contains: city, mode: 'insensitive' }
      if (orgId && orgId.trim()) where.branch = { companyId: orgId }
      const logs = await prisma.user.findMany({ where, orderBy: { name: 'asc' }, skip: (page-1)*perPage, take: perPage })
      const items: ConnectionItem[] = []
      for (const u of logs) {
        const conv = await getOrCreateConversation(me, u.id)
        items.push({ key: `log:${u.id}`, href: `/chat/${conv.id}`, title: String(u.name || u.email || ''), subtitle: 'Логопед', image: u.image, unread: await countUnreadFor(me, conv.id), role: u.role, featured: (u as { featured?: boolean | null })?.featured ?? false, featuredSuper: (u as { featuredSuper?: boolean | null })?.featuredSuper ?? false })
      }
      addGroup('Логопеды', items)
    } else if (opts.adminFilter === 'managers') {
      // Менеджеры — через ветки, затем фильтруем по q/city/org
      const branches = await prisma.branch.findMany({ where: { managerId: { not: null }, ...(orgId? { companyId: orgId } : {}) }, include: { manager: true } })
      const candidates: { id: string; name?: string | null; email?: string | null; image?: string | null; role?: string | null; city?: string | null }[] = []
      const seenMgr = new Set<string>()
      for (const b of branches) {
        const m = b.manager
        if (!m || m.id === me) continue
        if (seenMgr.has(m.id)) continue
        if (q && q.trim()) {
          const hit = (!!m.name && m.name.toLowerCase().includes(q.toLowerCase())) || (!!m.email && m.email.toLowerCase().includes(q.toLowerCase()))
          if (!hit) continue
        }
        if (city && city.trim()) {
          if (!(m.city && m.city.toLowerCase().includes(city.toLowerCase()))) continue
        }
        seenMgr.add(m.id)
        candidates.push({ id: m.id, name: m.name, email: m.email, image: m.image, role: m.role, city: m.city })
      }
      // пагинация по кандидатам
      const slice = candidates.slice((page-1)*perPage, (page-1)*perPage + perPage)
      const items: ConnectionItem[] = []
      for (const u of slice) {
        const conv = await getOrCreateConversation(me, u.id)
        items.push({ key: `mgr:${u.id}`, href: `/chat/${conv.id}`, title: String(u.name || u.email || ''), subtitle: 'Руководитель филиала', image: u.image, unread: await countUnreadFor(me, conv.id), role: u.role, featured: false, featuredSuper: false })
      }
      addGroup('Руководители филиалов', items)
    }
  }

  // Supervisors/Subordinates for non-parent (локальные связи для пользователя)
  if (role !== 'PARENT') {
    const links = await prisma.userSupervisor.findMany({ where: { OR: [ { supervisorId: me }, { subordinateId: me } ] }, include: { supervisor: true, subordinate: true } })
    const supervMap = new Map<string, ConnectionItem>()
    const subsMap = new Map<string, ConnectionItem>()
    const isAdminRole = (r?: string|null) => r === 'ADMIN' || r === 'SUPER_ADMIN' || r === 'ACCOUNTANT'
    for (const l of links) {
      if (l.supervisorId === me && l.subordinate && l.subordinate.id !== me) {
        const u = l.subordinate
        if (isAdminRole(u.role)) continue
        if (!subsMap.has(u.id)) {
          const conv = await getOrCreateConversation(me, u.id)
          subsMap.set(u.id, { key: `sub:${u.id}`, href: `/chat/${conv.id}`, title: u.name || u.email, subtitle: 'Подчинённый', image: u.image, unread: await countUnreadFor(me, conv.id), role: u.role, featured: (u as { featured?: boolean | null })?.featured ?? false, featuredSuper: (u as { featuredSuper?: boolean | null })?.featuredSuper ?? false })
        }
      } else if (l.subordinateId === me && l.supervisor && l.supervisor.id !== me) {
        const u = l.supervisor
        if (isAdminRole(u.role)) continue
        if (!supervMap.has(u.id)) {
          const conv = await getOrCreateConversation(me, u.id)
          supervMap.set(u.id, { key: `sup:${u.id}`, href: `/chat/${conv.id}`, title: u.name || u.email, subtitle: 'Руководитель', image: u.image, unread: await countUnreadFor(me, conv.id), role: u.role, featured: (u as { featured?: boolean | null })?.featured ?? false, featuredSuper: (u as { featuredSuper?: boolean | null })?.featuredSuper ?? false })
        }
      }
    }
    // Руководители филиалов по управляемым филиалам (кроме самого пользователя)
    const managers = new Map<string, ConnectionItem>()
    for (const br of (meUser?.managedBranches || [])) {
      const m = br.manager
      if (m && m.id !== me && !supervMap.has(m.id) && !isAdminRole(m.role)) {
        const conv = await getOrCreateConversation(me, m.id)
        managers.set(m.id, { key: `branchmgr:${m.id}`, href: `/chat/${conv.id}`, title: m.name || m.email, subtitle: 'Руководитель филиала', image: m.image, unread: await countUnreadFor(me, conv.id), role: m.role, featured: (m as { featured?: boolean | null })?.featured ?? false, featuredSuper: (m as { featuredSuper?: boolean | null })?.featuredSuper ?? false })
      }
      // Добавим логопедов управляемых филиалов как подчинённых
      for (const u of (br.users || [])) {
        if (u.id !== me && u.role === 'LOGOPED' && !subsMap.has(u.id) && !isAdminRole(u.role)) {
          const conv = await getOrCreateConversation(me, u.id)
          subsMap.set(u.id, { key: `sub:${u.id}`, href: `/chat/${conv.id}`, title: u.name || u.email, subtitle: `Филиал: ${br.name || ''}`.trim(), image: u.image, unread: await countUnreadFor(me, conv.id), role: u.role, featured: (u as { featured?: boolean | null })?.featured ?? false, featuredSuper: (u as { featuredSuper?: boolean | null })?.featuredSuper ?? false })
        }
      }
    }
    const superv = Array.from(supervMap.values())
    const managersArr = Array.from(managers.values())
    const subs = Array.from(subsMap.values())
    addGroup('Руководители', superv)
    addGroup('Руководители филиалов', managersArr)
    addGroup('Подчинённые', subs)

  }
  // Для всех ролей, кроме PARENT — возможность переписки с администраторами и бухгалтерией
  if (role !== 'PARENT') {
    const admins = await prisma.user.findMany({ where: { role: { in: ['SUPER_ADMIN','ADMIN','ACCOUNTANT'] }, id: { not: me } }, orderBy: { role: 'asc' } })
    const roleLabel = (r:string)=> r==='ACCOUNTANT'?'Бухгалтер':(r==='SUPER_ADMIN'?'Супер‑админ':'Админ')
    const items: ConnectionItem[] = []
    for (const u of admins) {
      // Skip demo accountant user to avoid duplicate admin chats in UI
      const email = u?.email as string | undefined
      const name = u?.name as string | undefined
      if (email === 'accountant@mylogoped.test' || name === 'ACCOUNTANT') continue
      const conv = await getOrCreateConversation(me, u.id)
      items.push({ key: `admin:${u.id}`, href: `/chat/${conv.id}`, title: String(u.name || u.email || ''), subtitle: roleLabel(u.role), image: u.image, unread: await countUnreadFor(me, conv.id), role: u.role, featured: (u as { featured?: boolean | null })?.featured ?? false, featuredSuper: (u as { featuredSuper?: boolean | null })?.featuredSuper ?? false })
    }
    addGroup('Администраторы и бухгалтерия', items)
  }
  return groups
}
// (helper functions for unread by pair were removed as unused to keep linter clean)
