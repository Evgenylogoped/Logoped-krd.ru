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

  // Посчитаем метрики по каждому филиалу за период (+ разложение выплат на + и -)
  const stats = await Promise.all(branches.map(async (b: any) => {
    const whereBase = { branchId: b.id, createdAt: { gte: start, lte: end } }
    const [revenues, cashHeld, therapistBalance, payoutsPosAgg, payoutsNegAgg] = await Promise.all([
      (prisma as any).transaction.aggregate({ where: { ...whereBase, kind: 'REVENUE' }, _sum: { amount: true } }),
      (prisma as any).transaction.aggregate({ where: { ...whereBase, kind: 'CASH_HELD' }, _sum: { amount: true } }),
      (prisma as any).transaction.aggregate({ where: { ...whereBase, kind: 'THERAPIST_BALANCE' }, _sum: { amount: true } }),
      (prisma as any).transaction.aggregate({ where: { ...whereBase, kind: 'PAYOUT', amount: { gt: 0 } }, _sum: { amount: true } }),
      (prisma as any).transaction.aggregate({ where: { ...whereBase, kind: 'PAYOUT', amount: { lt: 0 } }, _sum: { amount: true } }),
    ])
    const payoutsPos = Number(payoutsPosAgg._sum?.amount || 0)
    const payoutsNegAbs = Math.abs(Number(payoutsNegAgg._sum?.amount || 0))
    return {
      branchId: b.id,
      branchName: b.name,
      companyName: b.company?.name || '',
      revenue: Number(revenues._sum?.amount || 0),
      cashHeld: Number(cashHeld._sum?.amount || 0),
      balance: Number(therapistBalance._sum?.amount || 0),
      payoutsPos,
      payoutsNegAbs,
      payoutsNet: payoutsPos - payoutsNegAbs,
    }
  }))

  const companies = role==='ACCOUNTANT' ? await (prisma as any).company.findMany({ orderBy: { name: 'asc' }, include: { owner: true } }) : []
  const cities = role==='ACCOUNTANT'
    ? Array.from(new Set([
        ...((branches.map((b: any) => (b.manager as any)?.city).filter(Boolean)) as string[]),
        ...((companies.map((c: any) => (c.owner as any)?.city).filter(Boolean)) as string[]),
      ])).sort((a,b)=> a.localeCompare(b))
    : []

  // Агрегаты по выбранным филиалам
  const total = stats.reduce((acc:any,s:any)=> ({
    revenue: acc.revenue + s.revenue,
    cashHeld: acc.cashHeld + s.cashHeld,
    balance: acc.balance + s.balance,
    payoutsPos: acc.payoutsPos + s.payoutsPos,
    payoutsNegAbs: acc.payoutsNegAbs + s.payoutsNegAbs,
    payoutsNet: acc.payoutsNet + s.payoutsNet,
  }), { revenue:0, cashHeld:0, balance:0, payoutsPos:0, payoutsNegAbs:0, payoutsNet:0 })

  // Breakdown of payouts
  const payoutsPosTotal = total.payoutsPos
  const payoutsNegTotal = total.payoutsNegAbs
  const payoutsNetTotal = total.payoutsNet

  // === Подготовка данных для графиков ===
  const branchIds = branches.map((b:any)=> b.id)
  // Транзакции приходов (REVENUE, CASH_HELD) и продажи абонементов (REVENUE без lessonId)
  const incomeTx = await (prisma as any).transaction.findMany({
    where: { branchId: { in: branchIds }, createdAt: { gte: start, lte: end }, kind: { in: ['REVENUE','CASH_HELD'] } },
    select: { id: true, createdAt: true, kind: true, amount: true, lessonId: true, meta: true },
    orderBy: { createdAt: 'asc' },
    take: 100000,
  })
  const payoutTxAll = await (prisma as any).transaction.findMany({
    where: { branchId: { in: branchIds }, createdAt: { gte: start, lte: end }, kind: 'PAYOUT' },
    select: { id: true, createdAt: true, amount: true },
    orderBy: { createdAt: 'asc' },
    take: 100000,
  })
  // Бакетируем по дням
  function daysRange(a: Date, b: Date) {
    const res: Date[] = []
    const d = new Date(a)
    d.setHours(0,0,0,0)
    const endD = new Date(b)
    endD.setHours(0,0,0,0)
    while (d <= endD) { res.push(new Date(d)); d.setDate(d.getDate()+1) }
    return res
  }
  const days = daysRange(start, end)
  type Bucket = { day: string; revenueNonPass: number; cashHeld: number; passSales: number; payoutPos: number; payoutNegAbs: number }
  const buckets: Bucket[] = days.map(d=> ({ day: d.toISOString().slice(0,10), revenueNonPass:0, cashHeld:0, passSales:0, payoutPos:0, payoutNegAbs:0 }))
  const bIndex = new Map(buckets.map((b,i)=> [b.day,i]))
  for (const t of incomeTx as any[]) {
    const key = new Date(t.createdAt).toISOString().slice(0,10)
    const i = bIndex.get(key)
    if (i===undefined) continue
    if (t.kind === 'CASH_HELD') { buckets[i].cashHeld += Number(t.amount||0) }
    else {
      if (t.lessonId) { buckets[i].revenueNonPass += Number(t.amount||0) }
      else { buckets[i].passSales += Number(t.amount||0) }
    }
  }
  for (const t of payoutTxAll as any[]) {
    const key = new Date(t.createdAt).toISOString().slice(0,10)
    const i = bIndex.get(key)
    if (i===undefined) continue
    const amt = Number(t.amount||0)
    if (amt>0) buckets[i].payoutPos += amt
    else if (amt<0) buckets[i].payoutNegAbs += Math.abs(amt)
  }
  const maxIncome = Math.max(1, ...buckets.map(b=> b.revenueNonPass + b.cashHeld + b.passSales))
  const maxPayout = Math.max(1, ...buckets.map(b=> Math.max(b.payoutPos, b.payoutNegAbs)))

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

      {/* KPI по выбранному набору филиалов */}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="card p-3">
          <div className="text-xs text-muted">Общий приход</div>
          <div className="text-2xl font-semibold">{total.revenue.toLocaleString('ru-RU')} ₽</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Нал. лог.</div>
          <div className="text-2xl font-semibold">{total.cashHeld.toLocaleString('ru-RU')} ₽</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Сумма к выплате логопедам</div>
          <div className="text-2xl font-semibold">{total.balance.toLocaleString('ru-RU')} ₽</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Выплата (рук.→лог.)</div>
          <div className="text-2xl font-semibold">{total.payoutsPos.toLocaleString('ru-RU')} ₽</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Возврат (лог.→рук.)</div>
          <div className="text-2xl font-semibold text-red-600">{total.payoutsNegAbs.toLocaleString('ru-RU')} ₽</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Нетто выплат</div>
          <div className={`text-2xl font-semibold ${total.payoutsNet<0?'text-red-600':''}`}>{total.payoutsNet.toLocaleString('ru-RU')} ₽</div>
        </div>
      </section>

      {/* График: стек приходов по дням */}
      <section className="card p-3 overflow-x-auto">
        <div className="text-sm text-muted mb-2">Приход по дням (стек): REVENUE без абонементов · Продажи абонементов · Нал. лог.</div>
        <div className="flex items-end gap-1 min-h-[140px]">
          {buckets.map((b,idx)=>{
            const totalDay = b.revenueNonPass + b.passSales + b.cashHeld
            const h = totalDay>0 ? Math.max(2, Math.round(120 * totalDay / maxIncome)) : 2
            const hRev = totalDay>0 ? Math.round(h * (b.revenueNonPass/totalDay)) : 0
            const hPass = totalDay>0 ? Math.round(h * (b.passSales/totalDay)) : 0
            const hCash = h - hRev - hPass
            return (
              <div key={idx} className="w-2 flex flex-col justify-end" title={`${b.day}\nREVENUE: ${b.revenueNonPass.toLocaleString('ru-RU')} ₽\nАбонементы: ${b.passSales.toLocaleString('ru-RU')} ₽\nНал. лог.: ${b.cashHeld.toLocaleString('ru-RU')} ₽`}>
                <div style={{ height: hRev }} className="bg-indigo-400" />
                <div style={{ height: hPass }} className="bg-emerald-400" />
                <div style={{ height: hCash }} className="bg-amber-400" />
              </div>
            )
          })}
        </div>
        <div className="mt-2 text-xs text-muted flex gap-4">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 inline-block bg-indigo-400"/> REVENUE</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 inline-block bg-emerald-400"/> Абонементы</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 inline-block bg-amber-400"/> Нал. лог.</span>
        </div>
      </section>

      {/* График: выплаты по дням (бар + net‑линия) */}
      <section className="card p-3 overflow-x-auto">
        <div className="text-sm text-muted mb-2">Выплаты по дням: Выплата · Возврат · Net</div>
        <div className="relative">
          <div className="flex items-end gap-2 min-h-[160px]">
            {buckets.map((b,idx)=>{
              const hPos = Math.round(120 * (b.payoutPos / maxPayout))
              const hNeg = Math.round(120 * (b.payoutNegAbs / maxPayout))
              return (
                <div key={idx} className="w-3 flex flex-col justify-end" title={`${b.day}\nВыплата: ${b.payoutPos.toLocaleString('ru-RU')} ₽\nВозврат: ${b.payoutNegAbs.toLocaleString('ru-RU')} ₽`}>
                  <div style={{ height: hPos }} className="bg-sky-500" />
                  <div style={{ height: hNeg }} className="bg-rose-500 mt-0.5" />
                </div>
              )
            })}
          </div>
          {/* Net линия поверх в svg */}
          <svg className="absolute inset-0 pointer-events-none" viewBox={`0 0 ${buckets.length*10} 140`} preserveAspectRatio="none">
            {(() => {
              const pts: string[] = []
              buckets.forEach((b, i) => {
                const net = b.payoutPos - b.payoutNegAbs
                const y = 120 - Math.round(120 * (Math.abs(net) / Math.max(1,maxPayout)))
                const x = i*10 + 5
                pts.push(`${x},${y}`)
              })
              return <polyline fill="none" stroke="var(--brand)" strokeWidth="2" points={pts.join(' ')} />
            })()}
          </svg>
        </div>
        <div className="mt-2 text-xs text-muted flex gap-4">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 inline-block bg-sky-500"/> Выплата</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 inline-block bg-rose-500"/> Возврат</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 inline-block" style={{ background: 'var(--brand)' }}/> Net</span>
        </div>
      </section>

      {/* Пирог: способы оплаты (как доли от прихода) */}
      {(() => {
        const totalIncomePie = buckets.reduce((s,b)=> s + b.revenueNonPass + b.passSales + b.cashHeld, 0)
        const rev = buckets.reduce((s,b)=> s + b.revenueNonPass, 0)
        const pass = buckets.reduce((s,b)=> s + b.passSales, 0)
        const cash = buckets.reduce((s,b)=> s + b.cashHeld, 0)
        const pRev = totalIncomePie>0 ? (rev/totalIncomePie*100) : 0
        const pPass = totalIncomePie>0 ? (pass/totalIncomePie*100) : 0
        const pCash = 100 - pRev - pPass
        const pieStyle: React.CSSProperties = { width: 160, height: 160, borderRadius: '50%', background: `conic-gradient(#6366f1 0% ${pRev}%, #10b981 ${pRev}% ${pRev+pPass}%, #f59e0b ${pRev+pPass}% 100%)` }
        return (
          <section className="card p-3">
            <div className="text-sm text-muted mb-2">Структура прихода</div>
            <div className="flex items-center gap-6">
              <div style={pieStyle} />
              <div className="text-sm space-y-1">
                <div className="inline-flex items-center gap-2"><span className="w-3 h-3 inline-block bg-indigo-500"/> REVENUE: {rev.toLocaleString('ru-RU')} ₽</div>
                <div className="inline-flex items-center gap-2"><span className="w-3 h-3 inline-block bg-emerald-500"/> Абонементы: {pass.toLocaleString('ru-RU')} ₽</div>
                <div className="inline-flex items-center gap-2"><span className="w-3 h-3 inline-block bg-amber-500"/> Нал. лог.: {cash.toLocaleString('ru-RU')} ₽</div>
              </div>
            </div>
          </section>
        )
      })()}

      {/* Топ логопеды */}
      {await (async()=>{
        const txTop = await (prisma as any).transaction.findMany({
          where: { branchId: { in: branchIds }, createdAt: { gte: start, lte: end }, kind: { in: ['CASH_HELD','PAYOUT'] } },
          select: { userId: true, kind: true, amount: true },
          take: 50000,
        })
        const byUser: Record<string, { cash:number; payoutPos:number; payoutNegAbs:number }> = {}
        for (const t of txTop as any[]) {
          const uid = String(t.userId||'')
          if (!uid) continue
          byUser[uid] ||= { cash:0, payoutPos:0, payoutNegAbs:0 }
          if (t.kind==='CASH_HELD') byUser[uid].cash += Number(t.amount||0)
          else if (t.kind==='PAYOUT') {
            const a = Number(t.amount||0)
            if (a>0) byUser[uid].payoutPos += a; else if (a<0) byUser[uid].payoutNegAbs += Math.abs(a)
          }
        }
        const ids = Object.keys(byUser)
        const users = ids.length>0 ? await (prisma as any).user.findMany({ where: { id: { in: ids } }, select: { id:true, name:true, email:true } }) : []
        type U = { id: string; name?: string|null; email?: string|null }
        const uMap = new Map<string, U>(users.map((u:any)=> [String(u.id), { id: String(u.id), name: u.name ?? null, email: u.email ?? null }]))
        const rows = ids.map(id=> {
          const u = uMap.get(id)
          const name = (u?.name || u?.email || id) as string
          return { id, name, cash: byUser[id].cash, payoutPos: byUser[id].payoutPos, payoutNegAbs: byUser[id].payoutNegAbs, income: byUser[id].cash - byUser[id].payoutNegAbs + byUser[id].payoutPos }
        })
          .sort((a,b)=> b.income - a.income)
          .slice(0,10)
        return (
          <section className="card p-3">
            <div className="mb-2 text-lg font-semibold">Топ логопеды (по доходу лог.)</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm table-zebra leading-tight">
                <thead>
                  <tr className="text-left text-muted">
                    <th className="py-2 pr-4">Логопед</th>
                    <th className="py-2 pr-4 text-right">Нал. лог.</th>
                    <th className="py-2 pr-4 text-right">Выплата</th>
                    <th className="py-2 pr-4 text-right">Возврат</th>
                    <th className="py-2 pr-4 text-right">Доход лог.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r=> (
                    <tr key={r.id}>
                      <td className="py-2 pr-4">{r.name}</td>
                      <td className="py-2 pr-4 text-right">{r.cash.toLocaleString('ru-RU')} ₽</td>
                      <td className="py-2 pr-4 text-right">{r.payoutPos.toLocaleString('ru-RU')} ₽</td>
                      <td className="py-2 pr-4 text-right">{r.payoutNegAbs.toLocaleString('ru-RU')} ₽</td>
                      <td className="py-2 pr-4 text-right">{r.income.toLocaleString('ru-RU')} ₽</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )
      })()}

      <div className="overflow-x-auto card-table p-3">
        <table className="min-w-full text-sm table-zebra leading-tight">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-4">Компания</th>
              <th className="py-2 pr-4">Филиал</th>
              <th className="py-2 pr-4 text-right">Выручка</th>
              <th className="py-2 pr-4 text-right">К выплате логопедам</th>
              <th className="py-2 pr-4 text-right">Нал. лог.</th>
              <th className="py-2 pr-4 text-right">Выплата</th>
              <th className="py-2 pr-4 text-right">Возврат</th>
              <th className="py-2 pr-4 text-right">Нетто</th>
            </tr>
          </thead>
          <tbody>
            {stats.length===0 && (
              <tr><td colSpan={8} className="py-3 text-muted">Нет данных за выбранный период</td></tr>
            )}
            {stats.map((s) => (
              <tr key={s.branchId}>
                <td className="py-2 pr-4">{s.companyName || '—'}</td>
                <td className="py-2 pr-4">{s.branchName}</td>
                <td className="py-2 pr-4 text-right">{s.revenue.toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4 text-right">{s.balance.toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4 text-right">{s.cashHeld.toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4 text-right">{s.payoutsPos.toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4 text-right">{s.payoutsNegAbs.toLocaleString('ru-RU')} ₽</td>
                <td className={`py-2 pr-4 text-right ${s.payoutsNet<0?'text-red-600':''}`}>{s.payoutsNet.toLocaleString('ru-RU')} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
