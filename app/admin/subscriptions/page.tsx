import React from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPlan, getPlanRemainingDays, type Plan, getPlanPrices, getConfigLimits } from '@/lib/subscriptions'
import { setUserPlanAdmin, setWhatsAppPhone, setPlanPrices, setPlanLimits } from './actions'
import ModuleCard from '@/components/ui/ModuleCard'
import { cookies } from 'next/headers'
import ClampHints from '@/components/admin/ClampHints'

export default async function AdminSubscriptionsPage({ searchParams }: { searchParams?: Promise<Record<string,string>> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) return <div className="container py-6">Доступ запрещён</div>

  const sp = (searchParams ? await searchParams : {}) as Record<string,string>
  const q = (sp.q || '').trim().toLowerCase()
  const planFilter = (sp.plan || '').toLowerCase() as Plan | ''
  const only = (sp.only || '').toUpperCase() as 'LOGOPED'|'LEADERS'|''
  const statusFilter = (sp.status || '').toLowerCase() as '' | 'active' | 'trialing' | 'canceled' | 'past_due' | 'inactive'
  const stripeFilter = (sp.stripe || '').toLowerCase() as '' | 'yes' | 'no'
  const page = Math.max(1, parseInt(sp.page || '1', 10) || 1)
  const perPage = 15

  // Выбираем кандидатов: логопеды + лидеры (владельцы компаний или менеджеры филиалов)
  // Сначала берём логопедов
  const logopeds = await prisma.user.findMany({ where: { role: 'LOGOPED' }, include: { ownedCompanies: true, branchRoles: true }, orderBy: { createdAt: 'desc' }, take: 2000 }) as any[]
  // Берём потенциальных лидеров из остальных
  const others = await prisma.user.findMany({ where: { role: { not: 'LOGOPED' } }, include: { ownedCompanies: true, branchRoles: true }, orderBy: { createdAt: 'desc' }, take: 2000 }) as any[]
  const leaders = others.filter(u => (u.ownedCompanies?.length || 0) > 0 || (u.branchRoles?.length || 0) > 0)

  let users = [...logopeds, ...leaders]
  if (only === 'LOGOPED') users = logopeds
  if (only === 'LEADERS') users = leaders

  if (q) {
    users = users.filter(u => {
      const hay = `${u.name || ''} ${u.email || ''}`.toLowerCase()
      return hay.includes(q)
    })
  }

  // Готовим данные подписки
  const rows = await Promise.all(users.slice(0, 1000).map(async u => {
    const [sub, billing] = await Promise.all([
      (prisma as any).subscription.findFirst({ where: { userId: u.id }, orderBy: { createdAt: 'desc' } }),
      (prisma as any).billingCustomer.findFirst({ where: { userId: u.id, provider: 'stripe' } }),
    ])
    const plan = (sub?.plan || await getUserPlan(u.id)) as Plan
    const status = (sub?.status || 'inactive') as string
    const days = await getPlanRemainingDays(u.id)
    const customerId = billing?.customerId as string | undefined
    return { user: u, plan, status, days, subId: sub?.id as string | undefined, customerId }
  }))

  // Скрываем beta из выбора админом (бета активируется только автоматически при регистрации и один раз)
  const planOptions: Plan[] = ['free','pro','pro_plus','max'] as any

  function planTitle(p: Plan) { return p === 'pro_plus' ? 'PRO+' : p.toUpperCase() }

  // Последний номер WhatsApp бухгалтера
  let phone = '+79889543377'
  try {
    const last = await prisma.auditLog.findFirst({ where: { action: 'BILLING_WHATSAPP_PHONE' }, orderBy: { createdAt: 'desc' } })
    const p = (last as any)?.payload?.trim?.() || ''
    if (p) phone = p
  } catch {}

  // Последние запросы смены плана (для списка)
  const recentRequests = await prisma.auditLog.findMany({ where: { action: 'PLAN_CHANGE_REQUEST' }, orderBy: { createdAt: 'desc' }, take: 50 })
  // Загружаем статусы, чтобы NEW подсвечивать только для ожидающих
  const [handledR, canceledR, deniedR] = await Promise.all([
    prisma.auditLog.findMany({ where: { action: 'PLAN_CHANGE_HANDLED' }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.auditLog.findMany({ where: { action: 'PLAN_CHANGE_CANCELED' }, orderBy: { createdAt: 'desc' }, take: 1000 }),
    prisma.auditLog.findMany({ where: { action: 'PLAN_CHANGE_DENIED' }, orderBy: { createdAt: 'desc' }, take: 1000 }),
  ])
  const handledSetR = new Set<string>()
  const canceledSetR = new Set<string>()
  const deniedSetR = new Set<string>()
  handledR.forEach((h:any)=>{ try { const p = JSON.parse(h.payload||'{}'); if (p?.requestId) handledSetR.add(String(p.requestId)) } catch {} })
  canceledR.forEach((c:any)=>{ try { const p = JSON.parse(c.payload||'{}'); if (p?.requestId) canceledSetR.add(String(p.requestId)) } catch {} })
  deniedR.forEach((d:any)=>{ try { const p = JSON.parse(d.payload||'{}'); if (p?.requestId) deniedSetR.add(String(p.requestId)) } catch {} })
  const isPending = (id: string) => !(handledSetR.has(id) || canceledSetR.has(id) || deniedSetR.has(id))
  const newCount = recentRequests.filter(r => ((Date.now() - new Date(r.createdAt).getTime()) <= 24*60*60*1000) && isPending(r.id)).length
  const prices = await getPlanPrices()
  const cfgLimits = await getConfigLimits()

  return (
    <div className="container py-6 space-y-4">
      <ClampHints />
      <ModuleCard
        title="Админ · Подписки пользователей"
        right={<div className="flex items-center gap-2"><a className="btn btn-outline btn-sm" href="/admin/subscriptions/requests">Все заявки на смену плана</a>{newCount > 0 && <span className="badge">Новых запросов: {newCount}</span>}</div>}
      >
        {/* пустое тело модуля для визуальной консистентности */}
      </ModuleCard>

      {/* Настройки офлайн-номера WhatsApp */}
      <ModuleCard title="Номер WhatsApp для офлайн-запросов">
        <div className="text-sm text-muted mb-2">Этот номер используется в кнопках WhatsApp на странице подписки пользователей.</div>
        <form action={setWhatsAppPhone} className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-muted">Номер</span>
            <input name="phone" defaultValue={phone} className="input" placeholder="+7XXXXXXXXXX" />
          </label>
          <button className="btn">Сохранить</button>
        </form>
      </ModuleCard>

      {/* Цены тарифов */}
      <ModuleCard title="Цены тарифов">
        <div className="text-sm text-muted mb-2">Эти цены видят логопеды/руководители и они будут подставляться в запросы WhatsApp для бухгалтерии.</div>
        <form action={setPlanPrices} className="grid gap-3 md:grid-cols-3">
          {(['pro','pro_plus','max'] as ('pro'|'pro_plus'|'max')[]).map(key => (
            <div key={key} className="rounded border p-2" style={{ background: 'var(--background)' }}>
              <div className="font-medium mb-2">{key==='pro_plus'?'PRO+':key.toUpperCase()}</div>
              <div className="grid gap-2">
                <label className="grid gap-1">
                  <span className="text-xs text-muted">Месяц</span>
                  <input name={`${key}_month`} defaultValue={prices[key].month} type="number" min={0} className="input" />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-muted">Год</span>
                  <input name={`${key}_year`} defaultValue={prices[key].year} type="number" min={0} className="input" />
                </label>
                <label className="grid gap-1">
                  <span className="text-xs text-muted">Навсегда</span>
                  <input name={`${key}_forever`} defaultValue={prices[key].forever ?? ''} type="number" min={0} className="input" placeholder="—" />
                </label>
              </div>
            </div>
          ))}
          <div className="md:col-span-3">
            <button className="btn">Сохранить цены</button>
          </div>
        </form>
      </ModuleCard>

      {/* Лимиты тарифов */}
      <ModuleCard title="Параметры планов (лимиты)">
        <div className="text-sm text-muted mb-2">Редактируйте количество филиалов, логопедов и объём медиа (MB) для каждого плана.</div>
        <form action={setPlanLimits} className="grid gap-3 md:grid-cols-5">
          {(['beta','free','pro','pro_plus','max'] as Plan[]).map((p) => (
            <div key={p} className="rounded border p-2" style={{ background: 'var(--background)' }}>
              <div className="font-medium mb-2">{p==='pro_plus'?'PRO+':p.toUpperCase()}</div>
              <label className="grid gap-1 mb-2">
                <span className="text-xs text-muted">Филиалы</span>
                <input name={`${p}_branches`} type="number" min={0} className="input" defaultValue={cfgLimits[p].branches} />
              </label>
              <label className="grid gap-1 mb-2">
                <span className="text-xs text-muted">Логопеды</span>
                <input name={`${p}_logopeds`} type="number" min={0} className="input" defaultValue={cfgLimits[p].logopeds} />
              </label>
              <label className="grid gap-1">
                <span className="text-xs text-muted">Медиа (MB)</span>
                <input name={`${p}_mediaMB`} type="number" min={0} className="input" defaultValue={cfgLimits[p].mediaMB} />
              </label>
            </div>
          ))}
          <div className="md:col-span-5">
            <button className="btn">Сохранить лимиты</button>
          </div>
        </form>
      </ModuleCard>

      {/* Пользователи и подписки */}
      <ModuleCard title="Пользователи и подписки">
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1">
          <span className="text-xs text-muted">Поиск</span>
          <input name="q" defaultValue={q} className="input" placeholder="Имя или e‑mail" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">Только</span>
          <select name="only" defaultValue={only} className="input !py-2 !px-2">
            <option value="">Все</option>
            <option value="LOGOPED">Логопеды</option>
            <option value="LEADERS">Руководители</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">План</span>
          <select name="plan" defaultValue={planFilter} className="input !py-2 !px-2">
            <option value="">Любой</option>
            {planOptions.map(p => <option key={p} value={p}>{planTitle(p)}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">Статус</span>
          <select name="status" defaultValue={statusFilter} className="input !py-2 !px-2">
            <option value="">Любой</option>
            <option value="active">active</option>
            <option value="trialing">trialing</option>
            <option value="past_due">past_due</option>
            <option value="canceled">canceled</option>
            <option value="inactive">inactive</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">Stripe</span>
          <select name="stripe" defaultValue={stripeFilter} className="input !py-2 !px-2">
            <option value="">Все</option>
            <option value="yes">Есть</option>
            <option value="no">Нет</option>
          </select>
        </label>
        <button className="btn btn-sm">Применить</button>
        {(q || planFilter || only) && <a className="btn btn-outline btn-sm" href="/admin/subscriptions">Сбросить</a>}
      </form>
      {/* Таблица */}
      <div className="rounded-xl border p-2 shadow-sm overflow-auto" style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', borderColor: 'rgba(255,255,255,0.4)' }}>
        <table className="table w-full text-sm">
          <thead style={{ position: 'sticky', top: 0, background: 'var(--background)', zIndex: 1 }}>
            <tr>
              <th>Пользователь</th>
              <th>Роль</th>
              <th>План</th>
              <th>Статус</th>
              <th>Осталось</th>
              <th>Stripe</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .filter(r => (planFilter ? r.plan === planFilter : true))
              .filter(r => (statusFilter ? r.status === statusFilter : true))
              .filter(r => (stripeFilter === 'yes' ? !!r.customerId : stripeFilter === 'no' ? !r.customerId : true))
              .slice((page-1)*perPage, (page-1)*perPage + perPage)
              .map(({ user, plan, status, days, customerId }) => (
              <tr key={user.id}>
                <td>
                  <div className="font-medium"><a className="underline" href={`/admin/subscriptions/${user.id}`}>{user.name || user.email}</a></div>
                  <div className="text-muted text-xs">{user.email}</div>
                </td>
                <td>{user.role}</td>
                <td>{planTitle(plan)}</td>
                <td>{status}</td>
                <td>{days > 0 ? `${days} дн.` : '—'}</td>
                <td>{customerId ? <a href={`https://dashboard.stripe.com/customers/${customerId}`} target="_blank" rel="noreferrer" className="underline">{customerId}</a> : <span className="text-muted">—</span>}</td>
                <td>
                  <form action={setUserPlanAdmin} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="userId" value={user.id} />
                    <select name="plan" defaultValue={plan} className="input !py-2 !px-2">
                      {planOptions.map(p => <option key={p} value={p}>{planTitle(p)}</option>)}
                    </select>
                    <select name="duration" defaultValue="month" className="input !py-2 !px-2">
                      <option value="month">1 месяц</option>
                      <option value="year">1 год</option>
                      <option value="forever">навсегда</option>
                    </select>
                    <button className="btn btn-secondary btn-sm">Применить</button>
                    <a className="btn btn-outline btn-sm" href={`/api/billing/checkout?plan=${encodeURIComponent(plan)}&duration=month&targetUserId=${encodeURIComponent(user.id)}`} target="_blank">Онлайн оплата</a>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </ModuleCard>

      {/* Пагинация */}
      {(() => {
        const total = rows
          .filter(r => (planFilter ? r.plan === planFilter : true))
          .filter(r => (statusFilter ? r.status === statusFilter : true))
          .filter(r => (stripeFilter === 'yes' ? !!r.customerId : stripeFilter === 'no' ? !r.customerId : true))
          .length
        const pages = Math.max(1, Math.ceil(total / perPage))
        if (pages <= 1) return null
        const mkUrl = (p: number) => {
          const u = new URL('http://x/admin/subscriptions')
          Object.entries({ q, plan: planFilter, only, status: statusFilter, stripe: stripeFilter, page: String(p) })
            .forEach(([k,v]) => { if (v) u.searchParams.set(k, String(v)) })
          return u.pathname + u.search
        }
        const items: React.ReactNode[] = []
        const start = Math.max(1, page - 2)
        const end = Math.min(pages, page + 2)
        if (page > 1) items.push(<a key="prev" className="btn btn-sm btn-outline" href={mkUrl(page-1)}>Назад</a>)
        for (let i = start; i <= end; i++) {
          items.push(
            <a key={i} className={`btn btn-sm ${i===page?'btn-secondary':'btn-outline'}`} href={mkUrl(i)}>{i}</a>
          )
        }
        if (page < pages) items.push(<a key="next" className="btn btn-sm btn-outline" href={mkUrl(page+1)}>Вперёд</a>)
        return <div className="flex flex-wrap gap-2">{items}</div>
      })()}

      {/* Справка по планам */}
      <ModuleCard title="Справка по планам">
        <div className="grid gap-2 md:grid-cols-5">
          {(['beta', ...planOptions] as Plan[]).map(p => {
            const L = cfgLimits[p]
            return (
              <div key={p} className="rounded border p-2" style={{ background: 'var(--background)' }}>
                <div className="font-medium">{planTitle(p)}</div>
                <div className="text-muted">Филиалы: {L.branches}</div>
                <div className="text-muted">Логопеды: {L.logopeds}</div>
                <div className="text-muted">Медиа: {(L as any).mediaMB} MByte</div>
                <div className="text-muted">Чат: {L.chat.enabled ? (L.chat.group ? 'групповой+личный' : 'личный') : 'нет'}</div>
              </div>
            )
          })}
        </div>
      </ModuleCard>
      {/* Последние запросы смены плана */}
      <ModuleCard title="Последние запросы смены плана" right={<span className="text-xs text-muted">Всего: {recentRequests.length}</span>}>
        <div className="overflow-auto">
          <table className="table w-full text-sm">
            <thead style={{ position: 'sticky', top: 0, background: 'var(--background)', zIndex: 1 }}>
              <tr>
                <th>Дата</th>
                <th>Пользователь</th>
                <th>Email</th>
                <th>Из → В</th>
                <th>Период</th>
                <th>Канал</th>
              </tr>
            </thead>
            <tbody>
              {recentRequests.map((r) => {
                let meta: any = {}
                try { meta = JSON.parse(r.payload || '{}') } catch {}
                const u = rows.find(x => x.user.id === meta.userId)?.user
                const isNew = ((Date.now() - new Date(r.createdAt).getTime()) <= 24*60*60*1000) && isPending(r.id)
                return (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{new Date(r.createdAt).toLocaleString('ru-RU')}{isNew && <span className="badge ml-1">NEW</span>}</td>
                    <td>{u ? (<a className="underline" href={`/admin/subscriptions/${u.id}`}>{u.name || u.email}</a>) : (meta.userName || meta.userId || '—')}</td>
                    <td className="text-muted">{u?.email || meta.userEmail || '—'}</td>
                    <td>{(meta.from||'').toUpperCase()} → {(meta.to||'').toUpperCase()}</td>
                    <td>{meta.period || '—'}</td>
                    <td>{meta.channel || '—'}</td>
                  </tr>
                )
              })}
              {recentRequests.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-muted">Заявок нет</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </ModuleCard>
    </div>
  )
}
