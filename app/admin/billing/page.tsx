import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPlan, FREE_MAX_BRANCHES, FREE_MAX_LOGOPEDS } from '@/lib/billing'
import { getLimits, getConfigLimits, type Plan } from '@/lib/subscriptions'
import { Card } from '@/components/ui/Card'

export default async function AdminBillingPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) return <div className="container py-6">Доступ запрещён</div>

  const companies = await prisma.company.findMany({ include: { owner: true, branches: { select: { id: true } } }, orderBy: { name: 'asc' } }) as any[]
  const companyIds = companies.map(c => c.id)
  const logopedsByCompany: Record<string, number> = Object.fromEntries(companyIds.map(id => [id, 0]))
  if (companyIds.length) {
    const logopeds = await prisma.user.findMany({ where: { role: 'LOGOPED', branch: { companyId: { in: companyIds } } }, select: { branch: { select: { companyId: true } } } })
    for (const u of logopeds) {
      const cid = (u as any).branch?.companyId as string | undefined
      if (cid) logopedsByCompany[cid] = (logopedsByCompany[cid] || 0) + 1
    }
  }

  const cfgLimits = await getConfigLimits()
  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Админ · Подписки и лимиты</h1>
      <Card className="text-sm">
        <div className="mb-1">Тарифы: Beta (15 дней) → Free, затем Pro / Pro+ / Max.</div>
        <div>Free по умолчанию: филиалы ≤ {FREE_MAX_BRANCHES}, логопеды ≤ {FREE_MAX_LOGOPEDS}. При наличии тарифа используются лимиты плана.</div>
      </Card>

      {/* Карточки тарифов */}
      {(() => {
        const plans: Plan[] = ['beta','free','pro','pro_plus','max']
        const title = (p: Plan) => p==='pro_plus' ? 'Pro+' : p.toUpperCase()
        const desc = (p: Plan) => {
          if (p==='beta') return 'Пробный 15 дней. Потом — Free.'
          if (p==='free') return 'Базовый бесплатный тариф.'
          if (p==='pro') return 'Для малого кабинета.'
          if (p==='pro_plus') return 'Расширенный тариф.'
          return 'Максимальные возможности.'
        }
        return (
          <div className="grid gap-3 md:grid-cols-5">
            {plans.map(p => {
              const L = cfgLimits[p]
              return (
                <Card key={p} className="space-y-2">
                  <div className="text-lg font-semibold">{title(p)}</div>
                  <div className="text-xs text-muted">{desc(p)}</div>
                  <ul className="text-sm space-y-1">
                    <li>Филиалы: <b>{L.branches}</b></li>
                    <li>Логопеды: <b>{L.logopeds}</b></li>
                    <li>Медиа: <b>{(L as any).mediaMB} MByte</b></li>
                    <li>Поддержка: <b>{L.support === 'priority' ? 'приоритетная' : 'email'}</b></li>
                    <li>Чат: <b>{L.chat.enabled ? (L.chat.group ? 'групповой + личный' : 'личный') : 'нет'}</b></li>
                    <li>Статистика филиалов: <b>{L.stats.branch ? 'да' : 'нет'}</b></li>
                  </ul>
                </Card>
              )
            })}
          </div>
        )
      })()}
      <div className="overflow-auto">
        <table className="table w-full text-sm">
          <thead>
            <tr>
              <th>Организация</th>
              <th>Владелец</th>
              <th>План</th>
              <th>Филиалы (исп/лим)</th>
              <th>Логопеды (исп/лим)</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {await Promise.all(companies.map(async c => {
              const plan: Plan = c.ownerId ? await getUserPlan(c.ownerId) as Plan : 'free'
              const limits = await getLimits(plan)
              const usedBranches = c.branches.length
              const usedLogopeds = logopedsByCompany[c.id] || 0
              const planLabel = plan === 'pro_plus' ? 'PRO+' : plan.toUpperCase()
              const brLimit = (c.allowedBranches ?? limits.branches)
              const lgLimit = (c.allowedLogopeds ?? limits.logopeds)
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.owner?.email || '—'}</td>
                  <td>{planLabel}</td>
                  <td>{usedBranches}/{brLimit}</td>
                  <td>{usedLogopeds}/{lgLimit}</td>
                  <td><a className="btn btn-sm" href={`/admin/organizations?q=${encodeURIComponent(c.name)}`}>Открыть</a></td>
                </tr>
              )
            }))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
