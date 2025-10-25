import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { getUserPlan, FREE_MAX_BRANCHES, FREE_MAX_LOGOPEDS } from '@/lib/billing'

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(role)) return <div>Доступ запрещён</div>

  const userId = (session.user as any).id as string
  const plan = await getUserPlan(userId)

  const [users, parents, lessons, payments, companies] = await Promise.all([
    prisma.user.count(),
    prisma.parent.count(),
    prisma.lesson.count(),
    prisma.payment.count(),
    prisma.company.findMany({ include: { branches: { select: { id: true } } }, orderBy: { name: 'asc' } }),
  ])

  // Подсчёт логопедов по компаниям через связь branch.companyId
  const companyIds = companies.map(c => c.id)
  const logopedsByCompany = Object.fromEntries(companyIds.map(id => [id, 0])) as Record<string, number>
  if (companyIds.length) {
    const logopeds = await prisma.user.findMany({
      where: { role: 'LOGOPED', branch: { companyId: { in: companyIds } } },
      select: { branch: { select: { companyId: true } } },
    })
    for (const u of logopeds) {
      const cid = (u as any).branch?.companyId as string | undefined
      if (cid) logopedsByCompany[cid] = (logopedsByCompany[cid] || 0) + 1
    }
  }

  return (
    <div className="container space-y-6 py-6">
      <h1 className="text-3xl font-bold">Админ‑панель</h1>

      {/* Баннер статуса плана */}
      <div className="rounded border p-3 text-sm" style={{ background: 'var(--card-bg)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>Текущий план: <b>{plan.toUpperCase()}</b>{plan==='free' && (<span className="text-muted"> · Free лимиты: филиалы ≤ {FREE_MAX_BRANCHES}, логопеды ≤ {FREE_MAX_LOGOPEDS}</span>)}</div>
          <Link className="btn btn-sm" href="/settings/billing">Управлять подпиской</Link>
        </div>
        {companies.length > 0 && (
          <div className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {companies.map(c => {
              const usedBranches = c.branches.length
              const limitBranches = c.allowedBranches
              const usedLogopeds = logopedsByCompany[c.id] || 0
              const limitLogopeds = c.allowedLogopeds
              return (
                <div key={c.id} className="rounded border p-2 text-xs" style={{ background: 'var(--background)' }}>
                  <div className="font-medium text-sm mb-1">{c.name}</div>
                  <div className="text-muted">Филиалы: {usedBranches}/{limitBranches}</div>
                  <div className="text-muted">Логопеды: {usedLogopeds}/{limitLogopeds}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="text-sm text-muted">Пользователи</div>
          <div className="text-2xl font-bold">{users}</div>
        </div>
        <div className="card">
          <div className="text-sm text-muted">Родители</div>
          <div className="text-2xl font-bold">{parents}</div>
        </div>
        <div className="card">
          <div className="text-sm text-muted">Занятия</div>
          <div className="text-2xl font-bold">{lessons}</div>
        </div>
        <div className="card">
          <div className="text-sm text-muted">Платежи</div>
          <div className="text-2xl font-bold">{payments}</div>
        </div>
      </section>

      <section className="section">
        <h2 className="mb-2 text-lg font-semibold">Быстрые ссылки</h2>
        <div className="flex flex-wrap gap-2">
          <Link className="btn" href="/admin/companies">Компании</Link>
          <Link className="btn" href="/admin/branches">Филиалы</Link>
          <Link className="btn" href="/admin/groups">Группы</Link>
          <Link className="btn" href="/admin/contracts">Договоры</Link>
          <Link className="btn" href="/admin/payments">Платежи</Link>
          <Link className="btn" href="/admin/users">Пользователи</Link>
        </div>
      </section>
    </div>
  )
}
