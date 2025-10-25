import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPlan, getConfigLimits, type Plan, getPlanRemainingDays, getPlanPrices } from '@/lib/subscriptions'
import { revalidatePath } from 'next/cache'
import PlanCard from '@/components/billing/PlanCard'
import LimitRequestButton from '@/components/billing/LimitRequestButton'
import PlanComparison from '@/components/billing/PlanComparison'
import PlanCompareMobile from '@/components/billing/PlanCompareMobile'
import ModuleCard from '@/components/ui/ModuleCard'

export default async function BillingSettingsPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return <div className="container py-6">Доступ запрещён</div>
  const userId = (session.user as any).id as string

  const sp = (searchParams ? await searchParams : {}) as Record<string, string>

  // Определяем: пользователь логопед или руководитель (владелец компании или менеджер филиала)
  const me = await (prisma as any).user.findUnique({ where: { id: userId }, include: { ownedCompanies: true, branchRoles: true } })
  const role = (session.user as any).role as string
  const isLogoped = role === 'LOGOPED'
  const isLeader = (me?.ownedCompanies?.length || 0) > 0 || (me?.branchRoles?.length || 0) > 0
  if (!(isLogoped || isLeader)) return <div className="container py-6">Доступ только для логопедов и руководителей</div>

  const sub = await (prisma as any).subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })
  const plan = (sub?.plan || (await getUserPlan(userId))) as Plan
  const status = sub?.status || 'inactive'
  const daysLeft = await getPlanRemainingDays(userId)
  const userEmail = (session.user as any)?.email as string
  const prices = await getPlanPrices()
  const limitsMap = await getConfigLimits()
  // Номер WhatsApp бухгалтера (читаем последнюю установку из AuditLog или используем дефолт)
  const waPhone = (() => {
    return undefined as any
  })()
  let phone = '+79889543377'
  try {
    const last = await prisma.auditLog.findFirst({ where: { action: 'BILLING_WHATSAPP_PHONE' }, orderBy: { createdAt: 'desc' } })
    const p = (last?.payload || '').trim()
    if (p) phone = p
  } catch {}

  async function notifyPlanRequest(formData: FormData) {
    'use server'
    const session = await getServerSession(authOptions)
    if (!session?.user) return
    const userId = (session.user as any).id as string
    const userEmail = (session.user as any).email as string | undefined
    const userName = (session.user as any).name as string | undefined
    const from = String(formData.get('from') || '')
    const to = String(formData.get('to') || '')
    const period = String(formData.get('period') || '')
    const channel = String(formData.get('channel') || '') // 'whatsapp' | 'accounting' | 'direct'
    const meta = { userId, userEmail, userName, from, to, period, channel }
    try {
      // Отменяем предыдущие активные заявки этого пользователя
      const prev = await prisma.auditLog.findMany({ where: { action: 'PLAN_CHANGE_REQUEST' }, orderBy: { createdAt: 'desc' }, take: 50 })
      const prevMine = prev.filter((r: any) => {
        try { const m = JSON.parse(r.payload || '{}'); return m.userId === userId } catch { return false }
      })
      for (const r of prevMine) {
        try { await prisma.auditLog.create({ data: { action: 'PLAN_CHANGE_CANCELED', payload: JSON.stringify({ requestId: r.id, by: 'new_request' }), actorId: userId } }) } catch {}
      }
      const created = await prisma.auditLog.create({ data: { action: 'PLAN_CHANGE_REQUEST', payload: JSON.stringify(meta), actorId: userId } })
      // Форсим обновление админских страниц и текущей
      try { revalidatePath('/admin/subscriptions') } catch {}
      try { revalidatePath('/admin/subscriptions/requests') } catch {}
      try { revalidatePath('/settings/billing') } catch {}
      return created
    } catch {}
  }

  // Для пользователей смена тарифа теперь не происходит мгновенно.
  // Статус последней заявки пользователя (сервером)
  const recentLogs = await prisma.auditLog.findMany({ where: { action: { in: ['PLAN_CHANGE_REQUEST','PLAN_CHANGE_CANCELED','PLAN_CHANGE_HANDLED'] } }, orderBy: { createdAt: 'desc' }, take: 200 })
  let lastMyRequest: any = null
  const canceled = new Set<string>()
  const handled = new Set<string>()
  recentLogs.forEach((r: any) => {
    try {
      const p = JSON.parse(r.payload || '{}')
      if (r.action === 'PLAN_CHANGE_CANCELED' && p.requestId) canceled.add(String(p.requestId))
      if (r.action === 'PLAN_CHANGE_HANDLED' && p.requestId) handled.add(String(p.requestId))
    } catch {}
  })
  for (const r of recentLogs) {
    if (r.action !== 'PLAN_CHANGE_REQUEST') continue
    try {
      const p = JSON.parse((r as any).payload || '{}')
      if (p.userId === userId) { lastMyRequest = { id: r.id, payload: p, createdAt: r.createdAt, status: canceled.has(r.id) ? 'canceled' : handled.has(r.id) ? 'handled' : 'pending' }; break }
    } catch {}
  }

  // Статус последнего запроса увеличения лимитов (сервером)
  const limitLogs = await prisma.auditLog.findMany({ where: { action: { in: ['LIMIT_INCREASE_REQUEST','LIMIT_INCREASE_CANCELED','LIMIT_INCREASE_DENIED','PLAN_LIMITS_OVERRIDE'] } }, orderBy: { createdAt: 'desc' }, take: 200 })
  let lastMyLimitRequest: any = null
  let lastApprovedForRequest: any = null
  const limitCanceled = new Set<string>()
  const limitDenied = new Set<string>()
  const limitApproved = new Set<string>()
  limitLogs.forEach((r: any) => {
    try {
      const p = JSON.parse(r.payload || '{}')
      if (r.action === 'LIMIT_INCREASE_CANCELED' && p.requestId) limitCanceled.add(String(p.requestId))
      if (r.action === 'LIMIT_INCREASE_DENIED' && p.requestId) limitDenied.add(String(p.requestId))
      if (r.action === 'PLAN_LIMITS_OVERRIDE' && p.requestId) limitApproved.add(String(p.requestId))
    } catch {}
  })
  for (const r of limitLogs) {
    if (r.action !== 'LIMIT_INCREASE_REQUEST') continue
    try {
      const p = JSON.parse((r as any).payload || '{}')
      if (p.userId === userId) {
        lastMyLimitRequest = { id: r.id, payload: p, createdAt: r.createdAt, status: limitCanceled.has(r.id) ? 'canceled' : limitDenied.has(r.id) ? 'denied' : limitApproved.has(r.id) ? 'approved' : 'pending' }
        if (lastMyLimitRequest.status === 'approved') {
          // найдём соответствующую запись PLAN_LIMITS_OVERRIDE
          const ov = limitLogs.find(x => {
            if (x.action !== 'PLAN_LIMITS_OVERRIDE') return false
            try { const pp = JSON.parse((x as any).payload || '{}'); return String(pp.requestId) === String(r.id) } catch { return false }
          }) as any
          if (ov) {
            try { const pp = JSON.parse(ov.payload || '{}'); lastApprovedForRequest = pp?.limits || null } catch {}
          }
        }
        break
      }
    } catch {}
  }

  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Подписка</h1>
      {lastMyRequest && (
        <ModuleCard title="Статус заявки на смену плана">
          <div className="text-sm">
            <b>Заявка на смену плана</b>: {String((lastMyRequest.payload?.from||'').toUpperCase())} → {String((lastMyRequest.payload?.to||'').toUpperCase())}
            {' · '}канал: {lastMyRequest.payload?.channel || '—'}
            {' · '}создано: {new Date(lastMyRequest.createdAt).toLocaleString('ru-RU')}
            {' · '}статус: {lastMyRequest.status==='pending'?'на рассмотрении':lastMyRequest.status==='handled'?'обработано':'отменено'}
            {lastMyRequest.status==='handled' && (
              <> {' · '}<a href="/settings/billing" className="underline">обновить страницу</a></>
            )}
          </div>
        </ModuleCard>
      )}

      <ModuleCard title="Информация по подписке" right={<span className="text-xs text-muted">Профиль: {userEmail}</span>}>
        <div className="text-sm">
          Текущий план: <b>{plan.toUpperCase()}</b> · статус: <b>{status}</b> · осталось {daysLeft > 0 ? `${daysLeft} дн.` : '0 дн.'}
        </div>
        <div className="text-[11px] text-muted mt-2">Пояснение: в плане Free скрыты разделы «Лич. финансы», «Шаблон недели», «Чат», «Занятия на главной». Для доступа оформите платный план.</div>
      </ModuleCard>

      {/* Баннер статуса запроса лимитов (MAX) */}
      {plan === 'max' && lastMyLimitRequest && (
        <ModuleCard title="Статус заявки на увеличение лимитов">
          <div className="text-sm">
            <b>Запрос на увеличение лимитов</b>: филиалы {lastMyLimitRequest.payload?.wanted?.branches ?? '—'}, логопеды {lastMyLimitRequest.payload?.wanted?.logopeds ?? '—'}, медиа {lastMyLimitRequest.payload?.wanted?.mediaMB ?? '—'} MB
            {' · '}создано: {new Date(lastMyLimitRequest.createdAt).toLocaleString('ru-RU')}
            {' · '}статус: {lastMyLimitRequest.status==='pending'?'на рассмотрении':lastMyLimitRequest.status==='approved'?'подтверждено':lastMyLimitRequest.status==='denied'?'отклонено':'отменено'}
            {lastMyLimitRequest.status==='approved' && lastApprovedForRequest && (
              <>
                {' · '}<span>Одобрено: филиалы {lastApprovedForRequest.branches ?? '—'}, логопеды {lastApprovedForRequest.logopeds ?? '—'}, медиа {lastApprovedForRequest.mediaMB ?? '—'} MB</span>
              </>
            )}
          </div>
        </ModuleCard>
      )}

      {/* Кнопка запроса лимитов (только MAX) */}
      {plan === 'max' && (
        <ModuleCard title="Индивидуальное повышение лимитов">
          <LimitRequestButton />
        </ModuleCard>
      )}

      <ModuleCard title="Планы и сравнение">
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {(['beta','free','pro','pro_plus','max'] as Plan[]).map((p) => {
            const L = limitsMap[p]
            const currentL = limitsMap[plan]
            const pricesFor = p==='pro' ? { month: prices.pro.month, year: prices.pro.year, forever: prices.pro.forever } : p==='pro_plus' ? { month: prices.pro_plus.month, year: prices.pro_plus.year, forever: prices.pro_plus.forever } : p==='max' ? { month: prices.max.month, year: prices.max.year, forever: prices.max.forever } : null
            const needBranches = currentL.branches > 1
            const recommended = (p==='pro' && !needBranches) || (p==='pro_plus' && needBranches)
            return (
              <PlanCard key={p} plan={p} currentPlan={plan} limits={L as any} currentLimits={currentL as any} prices={pricesFor as any} phone={phone} userEmail={userEmail} recommended={recommended} onRequest={notifyPlanRequest as any} />
            )
          })}
        </div>
        {/* Мобильный компаратор (xs/sm) */}
        <div className="mt-3">
          <PlanCompareMobile currentPlan={plan} limitsMap={limitsMap as any} prices={prices as any} phone={phone} userEmail={userEmail} />
        </div>
        {/* Табличное сравнение на десктопе */}
        <div className="mt-4">
          <PlanComparison currentPlan={plan} limitsMap={limitsMap as any} prices={prices as any} phone={phone} userEmail={userEmail} />
        </div>
      </ModuleCard>
    </div>
  )
}
