import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getUserPlan, getPlanRemainingDays, type Plan } from '@/lib/subscriptions'

export default async function AdminSubscriptionDetailsPage({ params }: { params: Promise<{ userId: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) return <div className="container py-6">Доступ запрещён</div>

  const { userId } = await params
  const user = await prisma.user.findUnique({ where: { id: userId } }) as any
  if (!user) return <div className="container py-6">Пользователь не найден</div>

  const [sub, plan, days, billing, transactions] = await Promise.all([
    (prisma as any).subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    getUserPlan(userId),
    getPlanRemainingDays(userId),
    (prisma as any).billingCustomer.findFirst({ where: { userId, provider: 'stripe' } }),
    prisma.auditLog.findMany({ where: { actorId: userId, OR: [ { action: { contains: 'BILLING' } }, { action: { contains: 'CHECKOUT' } } ] }, orderBy: { createdAt: 'desc' }, take: 200 }),
  ])

  const planTitle = (p: Plan) => p==='pro_plus' ? 'PRO+' : String(p).toUpperCase()

  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Подписка пользователя</h1>

      <div className="rounded border p-3 text-sm" style={{ background: 'var(--card-bg)' }}>
        <div className="font-medium">{user.name || user.email}</div>
        <div className="text-muted text-xs">{user.email} · роль: {user.role}</div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded border p-3" style={{ background: 'var(--background)' }}>
          <div className="text-xs text-muted">Текущий план</div>
          <div className="text-lg font-semibold">{planTitle(plan as Plan)}</div>
          <div className="text-sm text-muted">{days > 0 ? `Осталось ${days} дн.` : '—'}</div>
        </div>
        <div className="rounded border p-3" style={{ background: 'var(--background)' }}>
          <div className="text-xs text-muted">Снимок подписки</div>
          <div className="text-sm">План: <b>{String(sub?.plan || 'free').toUpperCase()}</b></div>
          <div className="text-sm">Статус: <b>{sub?.status || 'inactive'}</b></div>
          <div className="text-sm">Период: {sub?.currentPeriodStart ? new Date(sub.currentPeriodStart).toLocaleDateString('ru-RU') : '—'} — {sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString('ru-RU') : '—'}</div>
        </div>
        <div className="rounded border p-3" style={{ background: 'var(--background)' }}>
          <div className="text-xs text-muted">Stripe</div>
          <div className="text-sm">Клиент: {billing?.customerId ? <a className="underline" href={`https://dashboard.stripe.com/customers/${billing.customerId}`} target="_blank" rel="noreferrer">{billing.customerId}</a> : '—'}</div>
          <div className="text-sm">Статус: <span className="text-muted">{billing?.status || '—'}</span></div>
        </div>
      </div>

      <div className="rounded border p-3">
        <div className="font-semibold mb-2">История операций</div>
        <div className="overflow-auto">
          <table className="table w-full text-sm">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Событие</th>
                <th>Детали</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(t => (
                <tr key={t.id}>
                  <td className="whitespace-nowrap">{new Date(t.createdAt).toLocaleString('ru-RU')}</td>
                  <td>{t.action}</td>
                  <td className="max-w-[520px] truncate" title={t.payload}>{t.payload}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
