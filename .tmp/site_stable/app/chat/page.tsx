import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { cleanupGenericEmptyDuplicates } from './actions'
import { listUnifiedConversations, listConnections, countTotalUnread, ensureLogopedGroup, getLogopedGroupId } from './chatService'

export const revalidate = 0
export const dynamic = 'force-dynamic'

export default async function ChatListPage({ searchParams }: { searchParams?: Promise<{ to?: string; child?: string; cleanup?: string; type?: 'logopeds' | 'managers'; q?: string; city?: string; org?: string; page?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return <div className="container py-6">Доступ запрещён</div>
  const me = (session.user as any).id as string
  const role = (session.user as any).role as string
  const meUser = await (prisma as any).user.findUnique({ where: { id: me }, include: { branch: { include: { manager: true, company: { include: { owner: true } }, users: true } }, managedBranches: { include: { users: true } } } })
  if (!meUser) return redirect('/login')
  // Для логопеда гарантируем существование и синхронизацию группового чата с родителями активных детей
  let logopedGroupId: string | undefined = undefined
  if (role === 'LOGOPED') {
    try { await ensureLogopedGroup(me); logopedGroupId = await getLogopedGroupId(me) } catch {}
  }
  // Для родителя: синхронизируем группу его логопеда(ов), чтобы родитель увидел групповую беседу
  if (role === 'PARENT') {
    try {
      const parent = await (prisma as any).parent.findUnique({ where: { userId: me }, include: { children: true } })
      const logIds = Array.from(new Set((parent?.children || []).map((c:any)=> c.logopedId).filter(Boolean))) as string[]
      for (const lid of logIds) { try { await ensureLogopedGroup(lid) } catch {} }
    } catch {}
  }
  // Для селектов (админские фильтры): организации и города
  const companies = (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTANT')
    ? await (prisma as any).company.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })
    : []
  const cityRows = (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTANT')
    ? await (prisma as any).user.findMany({ where: { city: { not: null } }, select: { city: true } })
    : []
  const citySet = new Set<string>((cityRows || []).map((r: any) => String(r.city || '').trim()).filter(Boolean))
  const cityOptions: string[] = Array.from(citySet).sort((a: string, b: string) => a.localeCompare(b, 'ru'))

  const sp = (searchParams ? await searchParams : {}) as { to?: string; child?: string; cleanup?: string; type?: 'logopeds'|'managers'; q?: string; city?: string; org?: string; page?: string }
  // Авто-открытие/создание диалога по параметру ?to=<userId>
  const to = String(sp?.to || '').trim()
  const child = String(sp?.child || '').trim()
  const isAdminLike = (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTANT')
  const adminFilter = isAdminLike ? (sp?.type as any || '') as ('logopeds'|'managers'|'') : ''
  const q = String(sp?.q || '').trim()
  const city = String(sp?.city || '').trim()
  const org = String(sp?.org || '').trim()
  const pageNum = Math.max(1, Number(sp?.page || '1') || 1)
  if (to && to !== me) {
    try {
      // Validate target user exists to avoid FK errors (after DB reset old links may remain)
      const toUser = await (prisma as any).user.findUnique({ where: { id: to }, select: { id: true } })
      if (!toUser) return redirect('/chat')
      let conv
      if (child) {
        const childRow = await (prisma as any).child.findUnique({ where: { id: child }, select: { id: true } })
        if (!childRow) {
          // Fallback: open/create generic private conversation if child id is stale
          let convGen = await (prisma as any).conversation.findFirst({ where: { AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: to } } } ] }, select: { id: true } })
          if (!convGen) convGen = await (prisma as any).conversation.create({ data: { participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: to, role: 'MEMBER' }] } }, select: { id: true } })
          // ensure participants
          const pMeGen = await (prisma as any).conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: convGen.id, userId: me } } }).catch(()=>null)
          if (!pMeGen) await (prisma as any).conversationParticipant.create({ data: { conversationId: convGen.id, userId: me, role: 'MEMBER' } })
          const pToGen = await (prisma as any).conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: convGen.id, userId: to } } }).catch(()=>null)
          if (!pToGen) await (prisma as any).conversationParticipant.create({ data: { conversationId: convGen.id, userId: to, role: 'MEMBER' } })
          return redirect(`/chat/${convGen.id}`)
        }
        conv = await (prisma as any).conversation.findFirst({
          where: {
            title: `child:${child}`,
            AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: to } } } ],
          },
          select: { id: true }
        })
        if (!conv) {
          conv = await (prisma as any).conversation.create({ data: { title: `child:${child}`, participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: to, role: 'MEMBER' }] } }, select: { id: true } })
        } else {
          // Ensure both participants exist (after DB resets some rows might be missing)
          const pMe = await (prisma as any).conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: conv.id, userId: me } } }).catch(()=>null)
          if (!pMe) await (prisma as any).conversationParticipant.create({ data: { conversationId: conv.id, userId: me, role: 'MEMBER' } })
          const pTo = await (prisma as any).conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: conv.id, userId: to } } }).catch(()=>null)
          if (!pTo) await (prisma as any).conversationParticipant.create({ data: { conversationId: conv.id, userId: to, role: 'MEMBER' } })
        }
      } else {
        conv = await (prisma as any).conversation.findFirst({
          where: { AND: [ { participants: { some: { userId: me } } }, { participants: { some: { userId: to } } } ] },
          select: { id: true }
        })
        if (!conv) {
          conv = await (prisma as any).conversation.create({ data: { participants: { create: [{ userId: me, role: 'MEMBER' }, { userId: to, role: 'MEMBER' }] } }, select: { id: true } })
        } else {
          const pMe = await (prisma as any).conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: conv.id, userId: me } } }).catch(()=>null)
          if (!pMe) await (prisma as any).conversationParticipant.create({ data: { conversationId: conv.id, userId: me, role: 'MEMBER' } })
          const pTo = await (prisma as any).conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId: conv.id, userId: to } } }).catch(()=>null)
          if (!pTo) await (prisma as any).conversationParticipant.create({ data: { conversationId: conv.id, userId: to, role: 'MEMBER' } })
        }
      }
      return redirect(`/chat/${conv.id}`)
    } catch (e) {
      console.error('[chat/page] failed to open ?to chat', { to, child, error: (e as any)?.message })
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
      ? { adminFilter: adminFilter as any, search: { q, city, orgId: org || undefined }, pagination: { page: pageNum, perPage } }
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
            <img src={'/icons/group.png'} alt="Групповой чат" className="w-10 h-10 rounded-md object-cover" />
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
              {companies.map((co:any)=> (
                <option key={co.id} value={co.id}>{co.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-sm btn-primary">Применить</button>
        </form>
      )}
      {connectionGroups.length > 0 && (
        <div className="mb-6 space-y-5">
          {connectionGroups.map(g => (
            <div key={g.title}>
              <div className="text-sm text-muted mb-2">{g.title}</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {g.items.map(item => (
                  <Link key={item.key} href={item.href} className="relative rounded border p-3 shadow-sm hover:bg-gray-50 transition flex items-center gap-3" style={{ background: 'var(--card-bg)' }}>
                    <img src={item.image || '/avatar-child.svg'} alt={item.title} className="w-10 h-10 rounded-md object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{item.title}</div>
                      {item.subtitle && <div className="text-xs text-muted truncate">{item.subtitle}</div>}
                    </div>
                    {item.unread > 0 && (
                      <span className="absolute top-2 right-2 rounded-full bg-red-500 text-white text-[10px] px-1.5 min-w-[18px] text-center">{item.unread}</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
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
          const list = base.filter(u=> !connectionConvIds.has(u.id))
          return list
        })().map((u) => (
          <Link key={u.id} href={`/chat/${u.id}`} className="relative rounded border p-3 shadow-sm hover:bg-gray-50 transition" style={{ background: 'var(--card-bg)' }}>
            {u.unread > 0 && (
              <span className="absolute top-2 right-2 rounded-full bg-red-500 text-white text-[10px] px-1.5 min-w-[18px] text-center">{u.unread}</span>
            )}
            {u.child ? (
              <div className="flex items-center gap-3">
                <img src={u.child.photoUrl || '/avatar-child.svg'} alt={u.child.name} className="w-10 h-10 rounded-md object-cover" />
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.child.name}</div>
                  <div className="text-xs text-muted truncate">{u.otherUser.name || u.otherUser.email}</div>
                </div>
              </div>
            ) : (
              <div className="font-medium truncate">{u.otherUser.name || u.otherUser.email}</div>
            )}
            {u.last && (
              <div className="mt-1 text-xs text-muted line-clamp-2">{u.last.body}</div>
            )}
          </Link>
        ))}
      </div>
    </div>
  )
}
