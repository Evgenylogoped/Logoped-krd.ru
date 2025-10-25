import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

function periodToRange(period: string) {
  const now = new Date()
  const end = new Date(now)
  const start = new Date(now)
  switch (period) {
    case 'week':
      start.setDate(start.getDate() - 7)
      break
    case 'month':
      start.setMonth(start.getMonth() - 1)
      break
    case 'halfyear':
      start.setMonth(start.getMonth() - 6)
      break
    case 'year':
      start.setFullYear(start.getFullYear() - 1)
      break
    default:
      start.setMonth(start.getMonth() - 6)
      break
  }
  return { start, end }
}

export default async function AdminFinanceStatisticsPage({ searchParams }: { searchParams?: Promise<{ period?: string; companyId?: string; branchId?: string; city?: string }> }) {
  const sp = (searchParams ? await searchParams : {}) as { period?: string; companyId?: string; branchId?: string; city?: string }
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const adminId = (session?.user as any)?.id
  if (!session) return <div className="container py-6">Доступ запрещён</div>
  let allowed = ['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)
  if (!allowed && role === 'LOGOPED') {
    const meGuard = await (prisma as any).user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
    const isOwnerGuard = Boolean(meGuard?.branch?.company?.ownerId === adminId)
    const isBranchManagerGuard = Boolean(meGuard?.branch?.managerId === adminId)
    allowed = isOwnerGuard || isBranchManagerGuard
  }
  if (!allowed) return <div className="container py-6">Доступ запрещён</div>

  const me = await (prisma as any).user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
  const isOwner = Boolean(me?.branch?.company?.ownerId === adminId)
  const isBranchManager = Boolean(me?.branch?.managerId === adminId)

  // Период (по умолчанию 6 месяцев)
  const period = sp?.period || 'halfyear'
  const { start, end } = periodToRange(period)

  // Определяем список филиалов для статистики
  let branches: any[] = []
  if (role === 'ACCOUNTANT') {
    const whereBr: any = {}
    if (sp?.companyId) whereBr.companyId = sp.companyId
    if (sp?.branchId) whereBr.id = sp.branchId
    branches = await (prisma as any).branch.findMany({ where: whereBr, include: { company: true, manager: true }, orderBy: { name: 'asc' } })
    // Фильтрация по городу: используем город менеджера филиала или владельца компании, если у филиала нет менеджера
    if (sp?.city) {
      const city = sp.city
      const ownerByCompany: Record<string, any> = {}
      if (branches.length > 0) {
        const companyIds = Array.from(new Set(branches.map((b: any) => b.companyId)))
        const companies = await (prisma as any).company.findMany({ where: { id: { in: companyIds } }, include: { owner: true } })
        for (const c of companies) ownerByCompany[c.id] = c
      }
      branches = branches.filter((b: any) => {
        const mgrCity = (b.manager as any)?.city || null
        const ownerCity = (ownerByCompany[b.companyId]?.owner as any)?.city || null
        return (mgrCity && mgrCity === city) || (!mgrCity && ownerCity === city)
      })
    }
  } else if ((isOwner || isBranchManager) && me?.branch?.companyId) {
    // владелец/руководитель — все филиалы компании, но в дашборде агрегаты считаются по своему филиалу
    branches = await (prisma as any).branch.findMany({ where: { companyId: me.branch.companyId }, include: { company: true, manager: true }, orderBy: { name: 'asc' } })
  }

  // Посчитаем метрики по каждому филиалу за период
  // Для простоты делаем по 3 агрегата на филиал
  const stats = await Promise.all(branches.map(async (b: any) => {
    const whereBase = { branchId: b.id, createdAt: { gte: start, lte: end } }
    const [revenues, cashHeld, therapistBalance, payouts] = await Promise.all([
      (prisma as any).transaction.aggregate({ where: { ...whereBase, kind: 'REVENUE' }, _sum: { amount: true } }),
      (prisma as any).transaction.aggregate({ where: { ...whereBase, kind: 'CASH_HELD' }, _sum: { amount: true } }),
      (prisma as any).transaction.aggregate({ where: { ...whereBase, kind: 'THERAPIST_BALANCE' }, _sum: { amount: true } }),
      (prisma as any).transaction.aggregate({ where: { ...whereBase, kind: 'PAYOUT' }, _sum: { amount: true } }),
    ])
    return {
      branchId: b.id,
      branchName: b.name,
      companyName: b.company?.name || '',
      revenue: Number(revenues._sum?.amount || 0),
      cashHeld: Number(cashHeld._sum?.amount || 0),
      balance: Number(therapistBalance._sum?.amount || 0),
      payouts: Number(payouts._sum?.amount || 0),
    }
  }))

  const companies = role==='ACCOUNTANT' ? await (prisma as any).company.findMany({ orderBy: { name: 'asc' }, include: { owner: true } }) : []
  const cities = role==='ACCOUNTANT'
    ? Array.from(new Set([
        ...((branches.map((b: any) => (b.manager as any)?.city).filter(Boolean)) as string[]),
        ...((companies.map((c: any) => (c.owner as any)?.city).filter(Boolean)) as string[]),
      ])).sort((a,b)=> a.localeCompare(b))
    : []

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Статистика</h1>
      </div>

      <form className="flex flex-wrap gap-2 items-end">
        <input type="hidden" name="period" value={period} />
        <div className="flex gap-2">
          <Link href={`?period=week${role==='ACCOUNTANT' ? `&companyId=${encodeURIComponent(sp?.companyId||'')}&branchId=${encodeURIComponent(sp?.branchId||'')}&city=${encodeURIComponent(sp?.city||'')}`:''}`} className={`btn btn-sm ${period==='week'?'btn-primary':''}`}>Неделя</Link>
          <Link href={`?period=month${role==='ACCOUNTANT' ? `&companyId=${encodeURIComponent(sp?.companyId||'')}&branchId=${encodeURIComponent(sp?.branchId||'')}&city=${encodeURIComponent(sp?.city||'')}`:''}`} className={`btn btn-sm ${period==='month'?'btn-primary':''}`}>Месяц</Link>
          <Link href={`?period=halfyear${role==='ACCOUNTANT' ? `&companyId=${encodeURIComponent(sp?.companyId||'')}&branchId=${encodeURIComponent(sp?.branchId||'')}&city=${encodeURIComponent(sp?.city||'')}`:''}`} className={`btn btn-sm ${period==='halfyear'?'btn-primary':''}`}>Полугодие</Link>
          <Link href={`?period=year${role==='ACCOUNTANT' ? `&companyId=${encodeURIComponent(sp?.companyId||'')}&branchId=${encodeURIComponent(sp?.branchId||'')}&city=${encodeURIComponent(sp?.city||'')}`:''}`} className={`btn btn-sm ${period==='year'?'btn-primary':''}`}>Год</Link>
        </div>
        {role==='ACCOUNTANT' && (
          <>
            <div>
              <label className="block text-xs mb-1">Компания</label>
              <select name="companyId" defaultValue={sp?.companyId||''} className="input default-select">
                <option value="">Все</option>
                {companies.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1">Город</label>
              <select name="city" defaultValue={sp?.city||''} className="input default-select">
                <option value="">Все</option>
                {cities.map((city: string) => (<option key={city} value={city}>{city}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1">Филиал</label>
              <select name="branchId" defaultValue={sp?.branchId||''} className="input default-select">
                <option value="">Все</option>
                {/* список филиалов зависит от выбранной компании (если выбрана) */}
                {branches.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </div>
            <button className="btn">Показать</button>
          </>
        )}
      </form>

      <div className="text-sm text-muted">Горизонт показа — до 2 лет (выберите период). Для бухгалтера показываются все компании, для владельца — филиалы его компании.</div>

      <div className="overflow-x-auto card-table p-3">
        <table className="min-w-full text-sm table-zebra leading-tight">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-4">Компания</th>
              <th className="py-2 pr-4">Филиал</th>
              <th className="py-2 pr-4 text-right">Выручка (tx)</th>
              <th className="py-2 pr-4 text-right">Сумма к выплате логопедам</th>
              <th className="py-2 pr-4 text-right">Долг логопедов</th>
              <th className="py-2 pr-4 text-right">Выплаты</th>
            </tr>
          </thead>
          <tbody>
            {stats.length===0 && (
              <tr><td colSpan={6} className="py-3 text-muted">Нет данных за выбранный период</td></tr>
            )}
            {stats.map((s) => (
              <tr key={s.branchId}>
                <td className="py-2 pr-4">{s.companyName || '—'}</td>
                <td className="py-2 pr-4">{s.branchName}</td>
                <td className="py-2 pr-4 text-right">{s.revenue.toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4 text-right">{s.balance.toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4 text-right">{s.cashHeld.toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4 text-right">{s.payouts.toLocaleString('ru-RU')} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
