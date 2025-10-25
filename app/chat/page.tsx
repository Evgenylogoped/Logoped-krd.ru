import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cleanupGenericEmptyDuplicates } from './actions'
import { listUnifiedConversations, listConnections, countTotalUnread, ensureLogopedGroup, getLogopedGroupId } from './chatService'
import VipBadge from '@/components/VipBadge'

export const revalidate = 0
export const dynamic = 'force-dynamic'

export default async function ChatListPage({ searchParams }: { searchParams?: { to?: string; child?: string; cleanup?: string; type?: 'logopeds' | 'managers'; q?: string; city?: string; org?: string; page?: string } }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return <div className="container py-6">Доступ запрещён</div>
  const me = String((session.user as { id?: string }).id || '')
  const role = String((session.user as { role?: string }).role || '')
  const meUser = await prisma.user.findUnique({ where: { id: me }, include: { branch: { include: { manager: true, company: { include: { owner: true } }, users: true } }, managedBranches: { include: { users: true } } } })
  if (!meUser) return redirect('/login')
  // Для логопеда гарантируем существование и синхронизацию группового чата с родителями активных детей
  let logopedGroupId: string | undefined = undefined
  if (role === 'LOGOPED') {
    try { await ensureLogopedGroup(me); logopedGroupId = await getLogopedGroupId(me) } catch {}
  }
  // Для родителя: синхронизируем группу его логопеда(ов), чтобы родитель увидел групповую беседу
  if (role === 'PARENT') {
    try {
      const parent = await prisma.parent.findUnique({ where: { userId: me }, include: { children: true } })
      const logIds = Array.from(new Set((parent?.children || []).map((c)=> c.logopedId).filter(Boolean))) as string[]
      for (const lid of logIds) { try { await ensureLogopedGroup(lid) } catch {} }
    } catch {}
  }
  // Для селектов (админские фильтры): организации и города
  const companies = (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTANT')
    ? await prisma.company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
    : []
  const cityRows = (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTANT')
    ? await prisma.user.findMany({ where: { city: { not: null } }, select: { city: true } })
    : []
  const citySet = new Set<string>((cityRows || []).map((r) => String((r as { city?: string | null }).city || '').trim()).filter(Boolean))
  const cityOptions: string[] = Array.from(citySet).sort((a: string, b: string) => a.localeCompare(b, 'ru'))

  const sp = (searchParams ? searchParams : {}) as { to?: string; child?: string; cleanup?: string; type?: 'logopeds'|'managers'; q?: string; city?: string; org?: string; page?: string }
  // Авто-открытие/создание диалога по параметру ?to=<userId>
  const to = String(sp?.to || '').trim()
  const child = String(sp?.child || '').trim()
  const isAdminLike = (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTANT')
  const adminFilter: 'logopeds' | 'managers' | '' = isAdminLike ? ((sp?.type as 'logopeds' | 'managers' | undefined) || '') : ''
  const q = String(sp?.q || '').trim()
  const city = String(sp?.city || '').trim()
  const org = String(sp?.org || '').trim()
  const pageNum = Math.max(1, Number(sp?.page || '1') || 1)
  if (to && to !== me) {
    try {
      // Validate target user exists to avoid FK errors (after DB reset old links may remain)
      const toUser = await prisma.user.findUnique({ where: { id: to }, select: { id: true } })
      if (!toUser) return redirect('/chat')
      let conv
      if (child) {
        const childRow = await prisma.child.findUnique({ where: { id: child }, select: { id: true } })
        if (!childRow) {
          // Fallback: open/create generic private conversation if child id is stale
          let convGen = await prisma.conversation.findFirst({ where: { AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: to } } } ] }, select: { id: true } })
          if (!convGen) convGen = await prisma.conversation.create({ data: { participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: to, role: 'MEMBER' }] } }, select: { id: true } })
          // ensure participants
          const pMeGen = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: convGen.id, userId: me } } }).catch(()=>null)
          if (!pMeGen) await prisma.conversationParticipant.create({ data: { conversationId: convGen.id, userId: me, role: 'MEMBER' } })
          const pToGen = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: convGen.id, userId: to } } }).catch(()=>null)
          if (!pToGen) await prisma.conversationParticipant.create({ data: { conversationId: convGen.id, userId: to, role: 'MEMBER' } })
          return redirect(`/chat/${convGen.id}`)
        }
        conv = await prisma.conversation.findFirst({
          where: {
            title: `child:${child}`,
            AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: to } } } ],
          },
          select: { id: true }
        })
        if (!conv) {
          conv = await prisma.conversation.create({ data: { title: `child:${child}`, participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: to, role: 'MEMBER' }] } }, select: { id: true } })
        } else {
          // Ensure both participants exist (after DB resets some rows might be missing)
          const pMe = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: conv.id, userId: me } } }).catch(()=>null)
          if (!pMe) await prisma.conversationParticipant.create({ data: { conversationId: conv.id, userId: me, role: 'MEMBER' } })
          const pTo = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: conv.id, userId: to } } }).catch(()=>null)
          if (!pTo) await prisma.conversationParticipant.create({ data: { conversationId: conv.id, userId: to, role: 'MEMBER' } })
        }
      } else {
        conv = await prisma.conversation.findFirst({
          where: { AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: to } } } ] },
          select: { id: true }
        })
        if (!conv) {
          conv = await prisma.conversation.create({ data: { participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: to, role: 'MEMBER' }] } }, select: { id: true } })
        } else {
          const pMe = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: conv.id, userId: me } } }).catch(()=>null)
          if (!pMe) await prisma.conversationParticipant.create({ data: { conversationId: conv.id, userId: me, role: 'MEMBER' } })
          const pTo = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: conv.id, userId: to } } }).catch(()=>null)
          if (!pTo) await prisma.conversationParticipant.create({ data: { conversationId: conv.id, userId: to, role: 'MEMBER' } })
        }
      }
      return redirect(`/chat/${conv.id}`)
    } catch (e) {
      const errMsg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message?: unknown }).message ?? '') : String(e)
      console.error('[chat/page] failed to open ?to chat', { to, child, error: errMsg })
      return redirect('/chat')
    }
  }
  // Автоочистка общих пустых дублей (безопасно)
  try { await cleanupGenericEmptyDuplicates() } catch {}
  const unified = await listUnifiedConversations(me)
  const totalUnread = await countTotalUnread(me)

  // «Связи» берём из сервиса
  const perPage = (q || city || org) ? 15 : 10
  const connectionGroupsRaw = await listConnections(
    me,
    role,
    adminFilter
      ? { adminFilter, search: { q, city, orgId: org || undefined }, pagination: { page: pageNum, perPage } }
      : undefined
  )
  const connectionGroups = (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTANT')
    ? (adminFilter ? connectionGroupsRaw : [])
    : connectionGroupsRaw

  return (
    <div className="container py-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Чаты</h1>
        {totalUnread > 0 && (
          <span className="rounded-full bg-red-500 text-white text-[11px] px-2 py-0.5">{totalUnread}</span>
        )}
      </div>
      {role==='LOGOPED' && logopedGroupId && (
        <div className="mb-4">
          <Link href={`/chat/${logopedGroupId}`} className="relative rounded border p-3 shadow-sm hover:bg-gray-50 transition flex items-center gap-3" style={{ background: 'var(--card-bg)' }}>
            <img src={'/icons/group.png'} alt="Групповой чат" width={40} height={40} className="w-10 h-10 rounded-md object-cover" />
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">Группа: родители активных детей</div>
              <div className="text-xs text-muted truncate">Сообщения всем родителям детей из вашей текущей нагрузки</div>
            </div>
          </Link>
        </div>
      )}
      {isAdminLike && (
        <div className="mb-4 flex items-center gap-2">
          <Link
            href="/chat?type=logopeds"
            className={`px-3 py-1.5 rounded border ${adminFilter==='logopeds' ? 'text-white' : ''}`}
            style={adminFilter==='logopeds' ? { background: 'var(--brand)', borderColor: 'var(--brand)' } : { background: 'var(--card-bg)' }}
          >
            Логопеды
          </Link>
          <Link
            href="/chat?type=managers"
            className={`px-3 py-1.5 rounded border ${adminFilter==='managers' ? 'text-white' : ''}`}
            style={adminFilter==='managers' ? { background: 'var(--brand)', borderColor: 'var(--brand)' } : { background: 'var(--card-bg)' }}
          >
            Руководители
          </Link>
          {!adminFilter && <span className="text-sm text-muted">Выберите фильтр, чтобы показать списки</span>}
        </div>
      )}
      {isAdminLike && adminFilter && (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
          <input type="hidden" name="type" value={adminFilter} />
          <div className="flex flex-col">
            <label className="text-xs text-muted">ФИО/Email</label>
            <input name="q" defaultValue={q} placeholder="Поиск" className="input input-bordered input-sm" />
          </div>
          <div className="flex flex-col min-w-[180px]">
            <label className="text-xs text-muted">Город</label>
            <select name="city" defaultValue={city} className="select select-bordered select-sm">
              <option value="">Все города</option>
              {cityOptions.map((c: string) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col min-w-[220px]">
            <label className="text-xs text-muted">Организация</label>
            <select name="org" defaultValue={org} className="select select-bordered select-sm">
              <option value="">Все организации</option>
              {companies.map((co:{ id: string, name: string })=> (
                <option key={co.id} value={co.id}>{co.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-sm btn-primary">Применить</button>
        </form>
      )}
      {connectionGroups.length > 0 && (
        <div className="mb-6 space-y-5">
          {connectionGroups.map((g) => {
            const items = g.items.slice().sort((a,b)=> (b.featuredSuper?2:b.featured?1:0) - (a.featuredSuper?2:a.featured?1:0))
            return (
            <div key={g.title}>
              <div className="text-sm text-muted mb-2">{g.title}</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => (
                  <Link key={item.key} href={item.href} className="relative rounded border p-3 shadow-sm hover:bg-gray-50 transition flex items-center gap-3" style={{ background: 'var(--card-bg)' }}>
                    <img src={item.image || '/avatar-child.svg'} alt={item.title} width={40} height={40} className="w-10 h-10 rounded-md object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{item.title}</div>
                      {item.subtitle && (
                        <div className="text-xs text-muted truncate flex items-center gap-2">
                          <span>{item.subtitle}</span>
                          {(item.featuredSuper || item.featured) && <VipBadge level={item.featuredSuper ? 'VIP+' : 'VIP'} />}
                        </div>
                      )}
                    </div>
                    {item.unread > 0 && (
                      <span className="absolute top-2 right-2 rounded-full bg-red-500 text-white text-[10px] px-1.5 min-w-[18px] text-center">{item.unread}</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )})}
          {isAdminLike && adminFilter && (
            <div className="flex items-center gap-2 pt-2">
              {pageNum > 1 && (
                <Link href={`/chat?type=${adminFilter}${q?`&q=${encodeURIComponent(q)}`:''}${city?`&city=${encodeURIComponent(city)}`:''}${org?`&org=${encodeURIComponent(org)}`:''}&page=${pageNum-1}`} className="btn btn-sm">Назад</Link>
              )}
              <Link href={`/chat?type=${adminFilter}${q?`&q=${encodeURIComponent(q)}`:''}${city?`&city=${encodeURIComponent(city)}`:''}${org?`&org=${encodeURIComponent(org)}`:''}&page=${pageNum+1}`} className="btn btn-sm">Вперёд</Link>
            </div>
          )}
        </div>
      )}
      {/* Нижний список «Диалоги»: для админов/бухгалтеров скрыт, пока не выбран фильтр */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(() => {
          // Исключаем дубли: если беседа уже есть в «Связях», не показываем её в нижнем списке
          const connectionConvIds = new Set<string>()
          for (const g of connectionGroups) {
            for (const it of g.items) {
              const m = it.href.match(/\/chat\/([^?&#]+)/)
              if (m && m[1]) connectionConvIds.add(m[1])
            }
          }
          if (isAdminLike && !adminFilter) return false
          const base = (role==='PARENT' || role==='LOGOPED') ? unified.filter(u=>!u.child) : unified
          const list = base.filter(u=> !connectionConvIds.has(u.id))
          const showPlaceholder = list.length === 0 && connectionGroups.length === 0
          return showPlaceholder
        })() && (
          <div className="text-sm text-muted">Пока нет диалогов</div>
        )}
        {(isAdminLike && !adminFilter) ? [] : (() => {
          const connectionConvIds = new Set<string>()
          for (const g of connectionGroups) {
            for (const it of g.items) {
              const m = it.href.match(/\/chat\/([^?&#]+)/)
              if (m && m[1]) connectionConvIds.add(m[1])
            }
          }
          const base = (role==='PARENT' || role==='LOGOPED') ? unified.filter(u=>!u.child) : unified
          const list = base
            .filter(u=> !connectionConvIds.has(u.id))
            .sort((a,b)=> ((b.otherUser?.featuredSuper?2:(b.otherUser?.featured?1:0)) - (a.otherUser?.featuredSuper?2:(a.otherUser?.featured?1:0))))
          return list
        })().map((u) => (
          <Link key={u.id} href={`/chat/${u.id}`} className="relative rounded border p-3 shadow-sm hover:bg-gray-50 transition" style={{ background: 'var(--card-bg)' }}>
            {u.unread > 0 && (
              <span className="absolute top-2 right-2 rounded-full bg-red-500 text-white text-[10px] px-1.5 min-w-[18px] text-center">{u.unread}</span>
            )}
            {u.child ? (
              <div className="flex items-center gap-3">
                <img src={u.child.photoUrl || '/avatar-child.svg'} alt={u.child.name} width={40} height={40} className="w-10 h-10 rounded-md object-cover" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.child.name}</div>
                  <div className="text-xs text-muted truncate flex items-center gap-2">
                    <span>{u.otherUser.name || u.otherUser.email}</span>
                    {(u.otherUser.featuredSuper || u.otherUser.featured) && <VipBadge level={u.otherUser.featuredSuper ? 'VIP+' : 'VIP'} />}
                  </div>
                </div>
              </div>
            ) : (
              <div className="font-medium truncate flex items-center gap-2">
                <span>{u.otherUser.name || u.otherUser.email}</span>
                {(u.otherUser.featuredSuper || u.otherUser.featured) && <VipBadge level={u.otherUser.featuredSuper ? 'VIP+' : 'VIP'} />}
              </div>
            )}
            {u.last && (
              <div className="mt-1 text-xs text-muted line-clamp-2">
                <span className="opacity-80">{u.last.authorId === u.otherUser.id ? (u.last.authorName || 'Собеседник') : 'Вы'}: </span>
                {u.last.body}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
