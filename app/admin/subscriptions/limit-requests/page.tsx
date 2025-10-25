import React from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import ModuleCard from '@/components/ui/ModuleCard'

export default async function AdminLimitRequestsPage({ searchParams }: { searchParams?: Promise<Record<string,string>> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) return <div className="container py-6">Доступ запрещён</div>

  const sp = (searchParams ? await searchParams : {}) as Record<string,string>
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)
  const perPage = Math.min(100, Math.max(10, parseInt(sp.perPage || '20', 10) || 20))
  const q = (sp.q || '').trim().toLowerCase()
  const statusFilter = (sp.status || '').toLowerCase() as '' | 'pending' | 'approved' | 'denied' | 'canceled'

  const all = await prisma.auditLog.findMany({ where: { action: 'LIMIT_INCREASE_REQUEST' }, orderBy: { createdAt: 'desc' }, take: 1000 })
  const overrides = await prisma.auditLog.findMany({ where: { action: 'PLAN_LIMITS_OVERRIDE' }, orderBy: { createdAt: 'desc' }, take: 2000 })
  const denied = await prisma.auditLog.findMany({ where: { action: 'LIMIT_INCREASE_DENIED' }, orderBy: { createdAt: 'desc' }, take: 2000 })
  const canceled = await prisma.auditLog.findMany({ where: { action: 'LIMIT_INCREASE_CANCELED' }, orderBy: { createdAt: 'desc' }, take: 2000 })

  const approvedSet = new Set<string>()
  const deniedSet = new Set<string>()
  const canceledSet = new Set<string>()
  const approveMap = new Map<string, any>()
  for (const o of overrides as any[]) { try { const p = JSON.parse(o.payload||'{}'); if (p.requestId) { approvedSet.add(String(p.requestId)); approveMap.set(String(p.requestId), p) } } catch {} }
  for (const d of denied as any[]) { try { const p = JSON.parse(d.payload||'{}'); if (p.requestId) deniedSet.add(String(p.requestId)) } catch {} }
  for (const c of canceled as any[]) { try { const p = JSON.parse(c.payload||'{}'); if (p.requestId) canceledSet.add(String(p.requestId)) } catch {} }

  const rows = all
    .map(r => {
      let meta: any = {}
      try { meta = JSON.parse((r as any).payload || '{}') } catch {}
      const status = approvedSet.has(r.id) ? 'approved' : deniedSet.has(r.id) ? 'denied' : canceledSet.has(r.id) ? 'canceled' : 'pending'
      const approved = approveMap.get(r.id)
      return { r, meta, status, approved }
    })
    .filter(x => q ? (`${x.meta.userEmail || ''} ${x.meta.userName || ''}`.toLowerCase().includes(q)) : true)
    .filter(x => statusFilter ? (statusFilter === x.status) : true)

  const total = rows.length
  const pages = Math.max(1, Math.ceil(total / perPage))
  const slice = rows.slice((page-1)*perPage, (page-1)*perPage + perPage)
  const newCount = all.filter(r => {
    const ageOk = (Date.now() - new Date(r.createdAt).getTime()) <= 24*60*60*1000
    const st = approvedSet.has(r.id) ? 'approved' : deniedSet.has(r.id) ? 'denied' : canceledSet.has(r.id) ? 'canceled' : 'pending'
    return ageOk && st === 'pending'
  }).length

  const mkUrl = (overrides: Record<string,string|number|undefined>) => {
    const u = new URL('http://x/admin/subscriptions/limit-requests')
    const allParams: Record<string, any> = { page, perPage, q, ...overrides }
    Object.entries(allParams).forEach(([k,v]) => { if (v) u.searchParams.set(k, String(v)) })
    return u.pathname + u.search
  }

  async function approve(formData: FormData) {
    'use server'
    const session = await getServerSession(authOptions)
    if (!session?.user) return
    const actorId = (session.user as any).id as string
    const requestId = String(formData.get('requestId') || '')
    const userId = String(formData.get('userId') || '')
    const branches = Number(formData.get('branches') || 0)
    const logopeds = Number(formData.get('logopeds') || 0)
    const mediaMB = Number(formData.get('mediaMB') || 0)
    const comment = String(formData.get('comment') || '')
    if (!requestId || !userId) return
    try { await prisma.auditLog.create({ data: { action: 'PLAN_LIMITS_OVERRIDE', payload: JSON.stringify({ requestId, userId, limits: { branches, logopeds, mediaMB }, comment }), actorId } }) } catch {}
    try { revalidatePath('/admin/subscriptions/limit-requests') } catch {}
  }

  async function deny(formData: FormData) {
    'use server'
    const session = await getServerSession(authOptions)
    if (!session?.user) return
    const actorId = (session.user as any).id as string
    const requestId = String(formData.get('requestId') || '')
    const comment = String(formData.get('comment') || '')
    if (!requestId) return
    try { await prisma.auditLog.create({ data: { action: 'LIMIT_INCREASE_DENIED', payload: JSON.stringify({ requestId, comment }), actorId } }) } catch {}
    try { revalidatePath('/admin/subscriptions/limit-requests') } catch {}
  }

  return (
    <div className="container py-6 space-y-4">
      <ModuleCard
        title="Админ · Заявки на увеличение лимитов"
        right={<div className="flex items-center gap-2">{newCount > 0 && <span className="badge">Новых: {newCount}</span>}<a className="btn btn-outline btn-sm" href="/admin/subscriptions/requests">Заявки на смену плана</a><a className="btn btn-outline btn-sm" href="/admin/subscriptions">Назад к подпискам</a></div>}
      >
      {/* Фильтры */}
      <form method="get" className="flex items-end gap-2">
            <label className="grid gap-1">
              <span className="text-xs text-muted">Поиск (email/имя)</span>
              <input name="q" defaultValue={q} className="input" placeholder="user@example.com" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted">Статус</span>
              <select name="status" defaultValue={statusFilter} className="input !py-2 !px-2">
                <option value="">Любой</option>
                <option value="pending">ожидает</option>
                <option value="approved">подтверждено</option>
                <option value="denied">отклонено</option>
                <option value="canceled">отменено</option>
              </select>
            </label>
            <button className="btn btn-sm">Применить</button>
            {(q || statusFilter) && <a className="btn btn-outline btn-sm" href="/admin/subscriptions/limit-requests">Сбросить</a>}
          </form>

      <div className="rounded-xl border p-2 shadow-sm overflow-auto" style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderColor: 'rgba(255,255,255,0.4)' }}>
        <table className="table w-full text-sm">
          <thead style={{ position: 'sticky', top: 0, background: 'var(--background)', zIndex: 1 }}>
            <tr>
              <th>Дата</th>
              <th>Email</th>
              <th>Имя</th>
              <th>Запрошено</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {slice.map(({ r, meta, status, approved }) => (
              <tr key={r.id} data-request-id={r.id}>
                <td className="whitespace-nowrap">{new Date(r.createdAt).toLocaleString('ru-RU')}</td>
                <td>{meta.userEmail || '—'}</td>
                <td>{meta.userName || '—'}</td>
                <td>
                  филиалы: {meta?.wanted?.branches ?? '—'}, логопеды: {meta?.wanted?.logopeds ?? '—'}, медиа: {meta?.wanted?.mediaMB ?? '—'} MB
                  {approved && <div className="text-xs text-muted">Одобрено: филиалы {approved?.limits?.branches ?? '—'}, логопеды {approved?.limits?.logopeds ?? '—'}, медиа {approved?.limits?.mediaMB ?? '—'} MB</div>}
                </td>
                <td>{status==='pending'?<span className="text-muted">ожидает</span>:status==='approved'?<span className="badge">подтверждено</span>:status==='denied'?<span className="badge">отклонено</span>:<span className="text-muted">отменено</span>}</td>
                <td className="min-w-[360px]">
                  <div className="flex flex-wrap gap-2 items-center">
                    <a className="btn btn-outline btn-xs" href={`/admin/subscriptions/${meta.userId || ''}`} target="_blank">Открыть пользователя</a>
                    {status==='pending' && (
                      <form action={approve} className="flex items-center gap-1">
                        <input type="hidden" name="requestId" value={r.id} />
                        <input type="hidden" name="userId" value={meta.userId || ''} />
                        <input name="branches" placeholder="Филиалы" className="input !py-1 !px-2 w-24" />
                        <input name="logopeds" placeholder="Логопеды" className="input !py-1 !px-2 w-24" />
                        <input name="mediaMB" placeholder="Медиа MB" className="input !py-1 !px-2 w-28" />
                        <input name="comment" placeholder="Комментарий" className="input !py-1 !px-2 w-40" />
                        <button className="btn btn-primary btn-xs" type="submit">Подтвердить</button>
                      </form>
                    )}
                    {status==='pending' && (
                      <form action={deny} className="flex items-center gap-1">
                        <input type="hidden" name="requestId" value={r.id} />
                        <input name="comment" placeholder="Причина" className="input !py-1 !px-2 w-56" />
                        <button className="btn btn-outline btn-xs" type="submit">Отклонить</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {slice.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-muted">Заявок не найдено</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ModuleCard>
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
