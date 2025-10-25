import React from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import ModuleCard from '@/components/ui/ModuleCard'

export default async function AdminPlanRequestsPage({ searchParams }: { searchParams?: Promise<Record<string,string>> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) return <div className="container py-6">Доступ запрещён</div>

  const sp = (searchParams ? await searchParams : {}) as Record<string,string>
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)
  const perPage = Math.min(100, Math.max(10, parseInt(sp.perPage || '20', 10) || 20))
  const channel = (sp.channel || '').toLowerCase()
  const q = (sp.q || '').trim().toLowerCase()
  const from = sp.from ? new Date(sp.from) : null
  const to = sp.to ? new Date(sp.to) : null
  const planFrom = (sp.planFrom || '').toLowerCase()
  const planTo = (sp.planTo || '').toLowerCase()
  const statusFilter = (sp.status || '').toLowerCase() as '' | 'pending' | 'handled' | 'denied' | 'canceled'

  // Базовый запрос
  const where: any = { action: 'PLAN_CHANGE_REQUEST' }
  if (from || to) {
    where.createdAt = {}
    if (from) where.createdAt.gte = from
    if (to) where.createdAt.lte = to
  }

  async function markDenied(formData: FormData) {
    'use server'
    const session = await getServerSession(authOptions)
    if (!session?.user) return
    const actorId = (session.user as any).id as string
    const requestId = String(formData.get('requestId') || '')
    const comment = String(formData.get('comment') || '').slice(0, 500)
    if (!requestId) return
    try {
      await prisma.auditLog.create({ data: { action: 'PLAN_CHANGE_DENIED', payload: JSON.stringify({ requestId, comment }), actorId } })
    } catch {}
    try { revalidatePath('/admin/subscriptions/requests') } catch {}
  }

  const all = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 1000,
  })

  // Статусы заявок
  const handled = await prisma.auditLog.findMany({ where: { action: 'PLAN_CHANGE_HANDLED' }, orderBy: { createdAt: 'desc' }, take: 2000 })
  const canceledLogs = await prisma.auditLog.findMany({ where: { action: 'PLAN_CHANGE_CANCELED' }, orderBy: { createdAt: 'desc' }, take: 2000 })
  const deniedLogs = await prisma.auditLog.findMany({ where: { action: 'PLAN_CHANGE_DENIED' }, orderBy: { createdAt: 'desc' }, take: 2000 })
  const handledSet = new Set<string>()
  const handledComments = new Map<string, string>()
  const canceledSet = new Set<string>()
  const deniedSet = new Set<string>()
  for (const h of handled as any[]) {
    try {
      const p = JSON.parse(h.payload || '{}')
      if (p.requestId) handledSet.add(String(p.requestId))
      if (p.requestId && p.comment) handledComments.set(String(p.requestId), String(p.comment))
    } catch {}
  }
  for (const c of canceledLogs as any[]) {
    try { const p = JSON.parse(c.payload || '{}'); if (p.requestId) canceledSet.add(String(p.requestId)) } catch {}
  }
  for (const d of deniedLogs as any[]) {
    try { const p = JSON.parse(d.payload || '{}'); if (p.requestId) deniedSet.add(String(p.requestId)) } catch {}
  }

  // Парсим payload и применяем доп. фильтры по каналу/поиску
  const rows = all
    .map(r => {
      let meta: any = {}
      try { meta = JSON.parse((r as any).payload || '{}') } catch {}
      const ageOk = (Date.now() - new Date(r.createdAt).getTime()) < 24*60*60*1000
      const isHandled = handledSet.has(r.id)
      const isCanceled = canceledSet.has(r.id)
      const isDenied = deniedSet.has(r.id)
      const isNew = ageOk && !isHandled && !isDenied && !isCanceled
      const comment = handledComments.get(r.id) || ''
      const status = isHandled ? 'обработано' : isDenied ? 'отклонено' : isCanceled ? 'отменено' : 'ожидает'
      return { r, meta, isNew, isHandled, isCanceled, isDenied, status, comment }
    })
    .filter(x => channel ? (String(x.meta.channel || '').toLowerCase() === channel) : true)
    .filter(x => q ? (`${x.meta.userEmail || ''} ${x.meta.userName || ''}`.toLowerCase().includes(q)) : true)
    .filter(x => planFrom ? (String(x.meta.from || '').toLowerCase() === planFrom) : true)
    .filter(x => planTo ? (String(x.meta.to || '').toLowerCase() === planTo) : true)
    .filter(x => statusFilter ? (
      statusFilter==='pending' ? (!x.isHandled && !x.isDenied && !x.isCanceled) :
      statusFilter==='handled' ? x.isHandled :
      statusFilter==='denied' ? x.isDenied :
      statusFilter==='canceled' ? x.isCanceled : true
    ) : true)
  const total = rows.length
  const newCount = rows.filter(x => x.isNew).length
  const pages = Math.max(1, Math.ceil(total / perPage))
  const slice = rows.slice((page-1)*perPage, (page-1)*perPage + perPage)

  function mkUrl(overrides: Record<string,string|number|undefined>) {
    const u = new URL('http://x/admin/subscriptions/requests')
    const allParams: Record<string, any> = { page, perPage, channel, q, from: sp.from || '', to: sp.to || '', planFrom, planTo, ...overrides }
    Object.entries(allParams).forEach(([k,v]) => { if (v) u.searchParams.set(k, String(v)) })
    return u.pathname + u.search
  }

  async function markHandled(formData: FormData) {
    'use server'
    const session = await getServerSession(authOptions)
    if (!session?.user) return
    const actorId = (session.user as any).id as string
    const requestId = String(formData.get('requestId') || '')
    const comment = String(formData.get('comment') || '').slice(0, 500)
    if (!requestId) return
    try {
      await prisma.auditLog.create({ data: { action: 'PLAN_CHANGE_HANDLED', payload: JSON.stringify({ requestId, comment }), actorId } })
      // Применяем фактическую смену плана для пользователя из запроса
      const req = await prisma.auditLog.findUnique({ where: { id: requestId } })
      if (req?.payload) {
        try {
          const meta = JSON.parse(req.payload || '{}') as any
          const targetUserId = meta.userId as string | undefined
          const toPlan = String(meta.to || 'free').toLowerCase()
          const period = String(meta.period || 'manual')
          if (targetUserId) {
            const now = new Date()
            let end: Date | null = null
            if (period === 'month') end = new Date(now.getTime() + 30*24*60*60*1000)
            else if (period === 'year') end = new Date(now.getTime() + 365*24*60*60*1000)
            else if (period === 'forever') end = null
            else end = null
            const current = await (prisma as any).subscription.findFirst({ where: { userId: targetUserId }, orderBy: { createdAt: 'desc' } })
            if (current) {
              await (prisma as any).subscription.update({ where: { id: current.id }, data: { plan: toPlan, status: 'active', currentPeriodStart: now, currentPeriodEnd: end } })
            } else {
              await (prisma as any).subscription.create({ data: { userId: targetUserId, plan: toPlan, status: 'active', currentPeriodStart: now, currentPeriodEnd: end } })
            }
            try { await prisma.auditLog.create({ data: { action: 'PLAN_CHANGED', payload: JSON.stringify({ requestId, userId: targetUserId, to: toPlan, period }) , actorId } }) } catch {}
          }
        } catch {}
      }
    } catch {}
    try { revalidatePath('/admin/subscriptions/requests') } catch {}
    try { revalidatePath('/admin/subscriptions') } catch {}
    try { revalidatePath('/settings/billing') } catch {}
  }

  return (
    <div className="container py-6 space-y-4">
      <ModuleCard title="Админ · Заявки на смену плана" right={<div className="flex items-center gap-2"><span className="badge">Новых: {newCount}</span><a className="btn btn-outline btn-sm" href="/admin/subscriptions">Назад к подпискам</a></div>}>
      {/* Фильтры */}
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1">
          <span className="text-xs text-muted">Канал</span>
          <select name="channel" defaultValue={channel} className="input !py-2 !px-2">
            <option value="">Любой</option>
            <option value="whatsapp">whatsapp</option>
            <option value="accounting">accounting</option>
            <option value="direct">direct</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">Из плана</span>
          <select name="planFrom" defaultValue={planFrom} className="input !py-2 !px-2">
            <option value="">Любой</option>
            <option value="beta">BETA</option>
            <option value="free">FREE</option>
            <option value="pro">PRO</option>
            <option value="pro_plus">PRO+</option>
            <option value="max">MAX</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">В план</span>
          <select name="planTo" defaultValue={planTo} className="input !py-2 !px-2">
            <option value="">Любой</option>
            <option value="beta">BETA</option>
            <option value="free">FREE</option>
            <option value="pro">PRO</option>
            <option value="pro_plus">PRO+</option>
            <option value="max">MAX</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">Поиск (email/имя)</span>
          <input name="q" defaultValue={q} className="input" placeholder="user@example.com" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">Статус</span>
          <select name="status" defaultValue={statusFilter} className="input !py-2 !px-2">
            <option value="">Любой</option>
            <option value="pending">ожидает</option>
            <option value="handled">обработано</option>
            <option value="denied">отклонено</option>
            <option value="canceled">отменено</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">c</span>
          <input name="from" type="date" defaultValue={sp.from || ''} className="input" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">по</span>
          <input name="to" type="date" defaultValue={sp.to || ''} className="input" />
        </label>
        <button className="btn btn-sm">Применить</button>
        {(channel || q || sp.from || sp.to || planFrom || planTo || statusFilter) && <a className="btn btn-outline btn-sm" href="/admin/subscriptions/requests">Сбросить</a>}
      </form>

      {/* Таблица */}
      <div className="rounded-xl border p-2 shadow-sm overflow-auto" style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderColor: 'rgba(255,255,255,0.4)' }}>
        <table className="table w-full text-sm">
          <thead style={{ position: 'sticky', top: 0, background: 'var(--background)', zIndex: 1 }}>
            <tr>
              <th>Дата</th>
              <th>Email</th>
              <th>Имя</th>
              <th>Из → В</th>
              <th>Период</th>
              <th>Канал</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {slice.map(({ r, meta, isNew, isHandled, isCanceled, isDenied, comment }) => (
              <tr key={r.id} data-request-id={r.id}>
                <td className="whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleString('ru-RU')}
                  {isNew && <span className="badge ml-1">NEW</span>}
                </td>
                <td>{meta.userEmail || '—'}</td>
                <td>{meta.userName || '—'}</td>
                <td>{(meta.from||'').toUpperCase()} → {(meta.to||'').toUpperCase()}</td>
                <td>{meta.period || '—'}</td>
                <td>{meta.channel || '—'}</td>
                <td>
                  {isCanceled ? <span className="text-muted">отменено</span> : isDenied ? <span className="badge">отклонено</span> : isHandled ? <span className="badge">обработано</span> : <span className="text-muted">ожидает</span>}
                  {comment ? <div className="text-xs text-muted">{comment}</div> : null}
                </td>
                <td className="min-w-[320px]">
                  <div className="flex flex-wrap gap-2 items-center">
                    <a className="btn btn-outline btn-xs" href={`/admin/subscriptions/${meta.userId || ''}`} target="_blank">Открыть пользователя</a>
                    {!isHandled && !isDenied && !isCanceled && (
                      <form action={markHandled} className="flex items-center gap-1">
                        <input type="hidden" name="requestId" value={r.id} />
                        <input name="comment" className="input !py-1 !px-2" placeholder="Комментарий" />
                        <button className="btn btn-primary btn-xs" type="submit">Обработано</button>
                      </form>
                    )}
                    {!isHandled && !isDenied && !isCanceled && (
                      <form action={markDenied} className="flex items-center gap-1">
                        <input type="hidden" name="requestId" value={r.id} />
                        <input name="comment" className="input !py-1 !px-2" placeholder="Причина отказа" />
                        <button className="btn btn-outline btn-xs" type="submit">Отклонить</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {slice.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center text-muted">Заявок не найдено</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      </ModuleCard>
      {/* Пагинация */}
      {pages > 1 && (
        <div className="flex flex-wrap gap-2">
          {page > 1 && <a className="btn btn-sm btn-outline" href={mkUrl({ page: page-1 })}>Назад</a>}
          {Array.from({ length: pages }).map((_, i) => (
            <a key={i} className={`btn btn-sm ${i+1===page ? 'btn-secondary' : 'btn-outline'}`} href={mkUrl({ page: i+1 })}>{i+1}</a>
          ))}
          {page < pages && <a className="btn btn-sm btn-outline" href={mkUrl({ page: page+1 })}>Вперёд</a>}
        </div>
      )}
    </div>
  )
}
