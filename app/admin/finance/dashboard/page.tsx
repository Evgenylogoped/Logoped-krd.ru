import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { computeSettlementWindow } from '@/lib/settlement'
import { getCurrentCommissionPercent } from '@/services/finance'
import { backfillLeaderLinks, archiveScopeTransactions, purgeOldArchives } from './actions'
import Link from 'next/link'

export default async function AdminFinanceDashboardPage({ searchParams }: { searchParams?: Promise<{ backfilled?: string; lessons?: string; tx?: string; archived?: string; purged?: string; count?: string; period?: string; viewUserId?: string; branch?: string }> }) {
  const sp = (searchParams ? await searchParams : {}) as { backfilled?: string; lessons?: string; tx?: string; archived?: string; purged?: string; count?: string; period?: string; viewUserId?: string; branch?: string }
  const session = await getServerSession(authOptions)
  const role = (session?.user ? (session.user as { role?: string }).role : undefined) as string | undefined
  const adminIdRaw = (session?.user ? (session.user as { id?: string }).id : undefined)
  if (!session) return <div className="container py-6">Доступ запрещён</div>
  const adminId = String(adminIdRaw || '')
  if (!adminId) return <div className="container py-6">Доступ запрещён</div>
  const roleStr = String(role || '')
  let allowed = ['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(roleStr)
  if (!allowed && roleStr === 'LOGOPED') {
    const meGuard = await prisma.user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
    const ownedCompany = await prisma.company.findFirst({ where: { ownerId: adminId }, select: { id: true } })
    const managesAny = await prisma.branch.findFirst({ where: { managerId: adminId }, select: { id: true } })
    const isOwnerGuard = Boolean(meGuard?.branch?.company?.ownerId === adminId) || Boolean(ownedCompany)
    const isBranchManagerGuard = Boolean(meGuard?.branch?.managerId === adminId) || Boolean(managesAny)
    allowed = isOwnerGuard || isBranchManagerGuard
  }
  if (!allowed) return <div className="container py-6">Доступ запрещён</div>

  // Определяем контур: владелец компании и руководитель филиала — ТОЛЬКО свой филиал; бухгалтер — все компании
  const me = await prisma.user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
  const ownedCompany = await prisma.company.findFirst({ where: { ownerId: adminId }, select: { id: true } })
  const managesAny = await prisma.branch.findFirst({ where: { managerId: adminId }, select: { id: true } })
  const isOwner = Boolean(me?.branch?.company?.ownerId === adminId) || Boolean(ownedCompany)
  const isBranchManager = Boolean(me?.branch?.managerId === adminId) || Boolean(managesAny)

  // Разрешённые филиалы и выбор
  let branchOptions: { id: string; name: string }[] = []
  if (roleStr === 'ACCOUNTANT') {
    const allBranches = await prisma.branch.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 500 })
    branchOptions = allBranches
  } else if (isOwner) {
    const myCompanyId = me?.branch?.companyId || ownedCompany?.id
    if (myCompanyId) {
      const companyBranches = await prisma.branch.findMany({ where: { companyId: myCompanyId }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 500 })
      branchOptions = companyBranches
    } else if (me?.branchId) {
      branchOptions = [{ id: me.branchId, name: me?.branch?.name || 'Основной офис' }]
    }
  } else if (isBranchManager && me?.branchId) {
    branchOptions = [{ id: me.branchId, name: me?.branch?.name || 'Основной офис' }]
  }
  const allowedBranchIds = branchOptions.map(b=>b.id)
  const selBranch = String(sp?.branch || '') || ''
  const hasBranchFilter = selBranch && allowedBranchIds.includes(selBranch)

  // Список логопедов — зависит от выбранного филиала (или всех разрешённых)
  let therapists: { id: string; name: string }[] = []
  if (allowedBranchIds.length>0) {
    const branchFilter = hasBranchFilter ? { branchId: selBranch } : { branchId: { in: allowedBranchIds } }
    const rawTherapists: { id: string; name: string | null; email: string | null }[] = await prisma.user.findMany({ where: { role: 'LOGOPED', ...(role==='ACCOUNTANT' && !hasBranchFilter ? {} : branchFilter) }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 500 })
    therapists = rawTherapists.map(t => ({ id: t.id, name: String(t.name || t.email || t.id) }))
  } else if (roleStr === 'ACCOUNTANT') {
    const rawTherapists: { id: string; name: string | null; email: string | null }[] = await prisma.user.findMany({ where: { role: 'LOGOPED' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' }, take: 500 })
    therapists = rawTherapists.map(t => ({ id: t.id, name: String(t.name || t.email || t.id) }))
  }
  const selUserId = String(sp?.viewUserId || '') || undefined
  const hasTherapistFilter = Boolean(selUserId && therapists.some(t=>t.id===selUserId))

  // Периоды: неделя/месяц/год
  const now = new Date()
  const period = (sp?.period || 'week') as 'day'|'week'|'month'|'year'
  const periodStart = (() => {
    if (period === 'day') return new Date(now.getFullYear(), now.getMonth(), now.getDate())
    if (period === 'week') { const wd = (now.getDay()+6)%7; const start = new Date(now); start.setDate(now.getDate()-wd); start.setHours(0,0,0,0); return start }
    if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1)
    return new Date(now.getFullYear(), 0, 1)
  })()
  const periodEnd = new Date(now)

  // where-фильтры транзакций по branchId (заполняется в services/finance.ts)
  const txWhereBase: Record<string, unknown> = {}
  // Фильтр по филиалу: выбранный или все разрешённые (для aggregate поддерживается in)
  if (hasBranchFilter) {
    txWhereBase['branchId'] = selBranch
  } else if (allowedBranchIds.length>0 && role!=='ACCOUNTANT') {
    txWhereBase['branchId'] = { in: allowedBranchIds }
  }
  if (hasTherapistFilter) {
    txWhereBase['userId'] = selUserId
  }
  // Отдельный guard по урокам (для транзакций, привязанных к уроку)
  const lessonGuard: Record<string, unknown> = (role !== 'ACCOUNTANT') ? { logopedId: { not: adminId } } : {}

  // where-фильтр для абонементов: ребёнок закреплён за логопедом нужного филиала
  const passWhereBase: Record<string, unknown> = {}
  if (hasBranchFilter) passWhereBase.child = { logoped: { branchId: selBranch } }
  else if (allowedBranchIds.length>0 && role!=='ACCOUNTANT') passWhereBase.child = { logoped: { branchId: { in: allowedBranchIds } } }
  if (hasTherapistFilter) {
    // Абонемент привязан к логопеду или к ребёнку логопеда
    passWhereBase.OR = [
      { logopedId: selUserId },
      { child: { logopedId: selUserId } },
    ]
  }

  // Аггрегаты в выбранном периоде (используем только нужные)
  type AggAmount = { _sum: { amount: Prisma.Decimal | number | null } }
  type AggPass = { _sum: { totalPrice: Prisma.Decimal | number | null } }
  let revenueAgg: AggAmount | undefined
  let subsAgg: AggPass | undefined
  try {
    ;[revenueAgg, subsAgg] = await Promise.all([
      prisma.transaction.aggregate({ where: { kind: 'REVENUE', createdAt: { gte: periodStart, lte: periodEnd }, archivedAt: null, lesson: { is: { ...lessonGuard, passUsages: { none: {} } } }, ...txWhereBase }, _sum: { amount: true } }) as unknown as Promise<AggAmount>,
      prisma.pass.aggregate({ where: { createdAt: { gte: periodStart, lte: periodEnd }, ...passWhereBase }, _sum: { totalPrice: true } }) as unknown as Promise<AggPass>,
    ])
  } catch {
    ;[revenueAgg, subsAgg] = await Promise.all([
      prisma.transaction.aggregate({ where: { kind: 'REVENUE', createdAt: { gte: periodStart, lte: periodEnd }, lesson: { is: { payoutStatus: 'PAID', ...lessonGuard, passUsages: { none: {} } } }, ...txWhereBase }, _sum: { amount: true } }) as unknown as Promise<AggAmount>,
      prisma.pass.aggregate({ where: { createdAt: { gte: periodStart, lte: periodEnd }, ...passWhereBase }, _sum: { totalPrice: true } }) as unknown as Promise<AggPass>,
    ])
  }
  const revenue = Number(revenueAgg?._sum?.amount ?? 0)
  const subsTotal = Number(subsAgg?._sum?.totalPrice ?? 0)
  // Для разложения PAYOUT на положительные/отрицательные получим список транзакций в периоде
  const payoutsList: { id: string; amount: number | Prisma.Decimal | null; createdAt: Date; userId: string | null }[] = await prisma.transaction.findMany({
    where: { kind: 'PAYOUT', createdAt: { gte: periodStart, lte: periodEnd }, ...(hasTherapistFilter ? { userId: selUserId } : {}), ...(hasBranchFilter ? { user: { branchId: selBranch } } : (allowedBranchIds.length>0 && role!=='ACCOUNTANT' ? { user: { branchId: { in: allowedBranchIds } } } : {})) },
    select: { id: true, amount: true, createdAt: true, userId: true },
    orderBy: { createdAt: 'asc' },
    take: 10000,
  })
  // Восстановим предыдущее время выплаты по каждому логопеду, чтобы посчитать предпросмотр окна для нулевых сумм
  const prevByUserId = new Map<string, Date | null>()
  const previewById: Record<string, number> = {}
  for (const t of payoutsList) {
    const uid = String(t.userId || '')
    const prev = prevByUserId.get(uid) || new Date(new Date(periodStart).getFullYear(), 0, 1)
    const amt = Number(t.amount || 0)
    if (amt === 0) {
      const toD = new Date(t.createdAt)
      const fromD = prev
      try {
            const win = await computeSettlementWindow(uid, fromD as Date, toD)
        const netVal = (win && typeof (win as { net?: unknown }).net === 'number') ? (win as { net?: number }).net! : 0
        previewById[t.id] = Number(netVal || 0)
      } catch {}
    }
    prevByUserId.set(uid, new Date(t.createdAt))
  }
  const payoutsPos = payoutsList.reduce((s:number,t)=> { const a=Number(t.amount||0); const d=(a===0?Number(previewById[t.id]||0):a); return s + (d>0?d:0) }, 0)
  const payoutsNegAbs = payoutsList.reduce((s:number,t)=> { const a=Number(t.amount||0); const d=(a===0?Number(previewById[t.id]||0):a); return s + (d<0?Math.abs(d):0) }, 0)
  // Процент распределения (если выбран конкретный логопед)
  let therapistPercent: number | null = null
  let leaderPercent: number | null = null
  if (hasTherapistFilter && selUserId) {
    try {
      const pct = await getCurrentCommissionPercent(selUserId)
      therapistPercent = Number(pct || 0)
      leaderPercent = Math.max(0, 100 - therapistPercent)
    } catch {}
  }

  // Восстанавливаем ПОЛНУЮ сумму уроков, оплаченных у логопеда (нал. лог.) за период
  // Это нужно, чтобы «Общий приход» показывал деньги от детей, а не долю руководителя
  const lessonsForCashDetect = await prisma.lesson.findMany({
    where: {
      settledAt: { gte: periodStart, lte: periodEnd },
      payoutStatus: 'PAID',
      ...(hasBranchFilter ? { logoped: { branchId: selBranch } } : (allowedBranchIds.length>0 && role!=='ACCOUNTANT' ? { logoped: { branchId: { in: allowedBranchIds } } } : {})),
      ...(hasTherapistFilter ? { logopedId: selUserId } : {}),
    },
    include: { transactions: true, enrolls: { include: { child: true } } },
    orderBy: { settledAt: 'desc' },
    take: 5000,
  })
  // Исключаем персональные платежи из расчётов (как в модуле «Выплаты»)
  type TxMeta = { personal?: boolean; paymentMethod?: string; paymentmethod?: string; nominalPrice?: number }
  type Tx = { createdAt?: Date | string; amount?: number | Prisma.Decimal | null; kind?: string | null; meta?: unknown | null }
  const parseMeta = (m: unknown): TxMeta => {
    if (m && typeof m === 'object') {
      const o = m as Record<string, unknown>
      return {
        personal: o.personal === true,
        paymentMethod: typeof o.paymentMethod === 'string' ? o.paymentMethod : undefined,
        paymentmethod: typeof o.paymentmethod === 'string' ? o.paymentmethod : undefined,
        nominalPrice: typeof o.nominalPrice === 'number' ? o.nominalPrice : undefined,
      }
    }
    return {}
  }
  type Child = { rateLesson?: number | Prisma.Decimal | null; firstName?: string | null; lastName?: string | null; middleName?: string | null; fullName?: string | null; name?: string | null }
  type Lesson = { transactions?: Tx[]; enrolls?: { child?: Child | null }[]; therapistShareAtTime?: number | null; leaderShareAtTime?: number | null; commissionPercentAtTime?: number | null; logoped?: { id?: string | null; name?: string | null; email?: string | null } | null }
  const eligibleLessons: Lesson[] = (lessonsForCashDetect as unknown as Lesson[]).filter(L => !((L.transactions || []).some((t)=> {
    if (!t) return false
    const m = parseMeta(t.meta)
    return m.personal === true
  })))
  const cashTherapistFull = (() => {
    const whoPaid = (L: Lesson): 'LEADER'|'THERAPIST'|'UNKNOWN' => {
      const txs = (L.transactions || []).slice().sort((a: Tx, b: Tx)=> new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
      const tx = txs[txs.length-1]
      const meta = parseMeta(tx?.meta)
      const mRaw = (meta.paymentMethod ? String(meta.paymentMethod) : (meta.paymentmethod ? String(meta.paymentmethod) : '')).toLowerCase()
      if (mRaw.includes('cash_therapist') || mRaw.includes('therapist')) return 'THERAPIST'
      if (mRaw.includes('subscription') || mRaw.includes('abon') || mRaw.includes('leader') || mRaw.includes('manager') || mRaw.includes('card') || mRaw.includes('bank') || mRaw.includes('noncash') || mRaw.includes('transfer')) return 'LEADER'
      const hasRevenue = (txs||[]).some((t)=> t?.kind==='REVENUE')
      const hasCashHeld = (txs||[]).some((t)=> String(t?.kind||'').toUpperCase()==='CASH_HELD')
      if (hasRevenue) return 'LEADER'
      if (hasCashHeld) return 'THERAPIST'
      return 'UNKNOWN'
    }
    const fullPrice = (L: Lesson): number => {
      const txs = (L.transactions || []).slice().sort((a: Tx, b: Tx)=> new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
      const anyNominal = (txs||[]).map((t)=> Number(parseMeta(t?.meta).nominalPrice ?? 0)).find((v:number)=> v>0)
      if (anyNominal && anyNominal > 0) return Math.round(anyNominal)
      const revenueTx = (txs||[]).find((t)=> t?.kind==='REVENUE' && Number(t?.amount||0) > 0)
      if (revenueTx) return Math.round(Number(revenueTx.amount||0))
      const hasCashHeld = (txs||[]).some((t)=> String(t?.kind||'').toUpperCase()==='CASH_HELD')
      if (hasCashHeld) {
        const pct = Number(L.commissionPercentAtTime || 0) || 50
        const leader = Number(L.leaderShareAtTime || 0)
        if (leader > 0 && pct>0 && pct<100) {
          const nominal = Math.round(leader * 100 / (100 - pct))
          if (nominal > 0) return nominal
        }
      }
      const sumShares = Number(L.therapistShareAtTime||0) + Number(L.leaderShareAtTime||0)
      if (sumShares > 0) return Math.round(sumShares)
      const rate = Number((L.enrolls||[])[0]?.child?.rateLesson || 0)
      return Math.max(0, Math.round(rate))
    }
    return (eligibleLessons as Lesson[]).reduce((acc, L)=> acc + (whoPaid(L)==='THERAPIST' ? fullPrice(L) : 0), 0)
  })()

  // Для отображения долга на карточке (расчёт удалён как неиспользуемый)
  const therapistShareAll = (L: Lesson): number => {
    const snap = Number(L?.therapistShareAtTime || 0)
    if (snap > 0) return Math.round(snap)
    const pct = Number(L?.commissionPercentAtTime ?? 50)
    const txs = (L.transactions||[]).slice().sort((a: Tx,b: Tx)=> new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
      const anyNominal = (txs||[]).map((t: Tx)=> Number(parseMeta(t.meta).nominalPrice ?? 0)).find((v:number)=> v>0)
    let nominal = 0
    if (anyNominal && anyNominal > 0) nominal = Math.round(anyNominal)
    else {
      const revenueTx2 = (txs||[]).find((t: Tx)=> t?.kind==='REVENUE' && Number(t?.amount||0) > 0)
      if (revenueTx2) nominal = Math.round(Number(revenueTx2.amount||0))
      else {
        const sumShares = Number(L.therapistShareAtTime||0) + Number(L.leaderShareAtTime||0)
        if (sumShares > 0) nominal = Math.round(sumShares)
        else nominal = Math.max(0, Math.round(Number((L.enrolls||[])[0]?.child?.rateLesson || 0)))
      }
    }
    return Math.round(Math.max(0, nominal * pct / 100))
  }
  // Доля логопеда за все проведённые уроки периода в текущем контуре
  const therapistShareSumAll = (eligibleLessons as Lesson[]).reduce((s:number,L)=> s + therapistShareAll(L), 0)
  // (ранее учитывалась дельта, больше не используется)

  // removed unused variable payoutsWithDebt and overCashTherapist (не использовались далее)

  // Общий приход (статистика): деньги от детей сейчас =
  //   REVENUE (не по абонементам, уже полная стоимость) + ПОЛНЫЕ суммы уроков нал. у логопеда + Продажи абонементов
  const totalIncome = Math.max(0, revenue) + Math.max(0, cashTherapistFull) + Math.max(0, subsTotal)
  // Остаток непогашенных абонементов (визуально на конец периода):
  // учитываем ВСЕ активные абонементы, а списания считаем только по урокам, подтверждённым к концу периода
  const activePasses = await prisma.pass.findMany({
    where: {
      status: 'ACTIVE',
      ...(hasBranchFilter
        ? { OR: [ { logoped: { branchId: selBranch } }, { child: { logoped: { branchId: selBranch } } } ] }
        : (allowedBranchIds.length>0 && role!=='ACCOUNTANT' ? { OR: [ { logoped: { branchId: { in: allowedBranchIds } } }, { child: { logoped: { branchId: { in: allowedBranchIds } } } } ] } : {})
      ),
      ...(hasTherapistFilter ? { OR: [{ logopedId: selUserId }, { child: { logopedId: selUserId } }] } : {}),
    },
    select: { id: true, totalLessons: true, totalPrice: true },
    take: 10000,
  })
  const passIds = (activePasses as unknown as { id: string }[]).map((p)=> p.id)
  const usages = passIds.length ? await prisma.passUsage.findMany({
    where: { passId: { in: passIds }, lesson: { payoutStatus: 'PAID', settledAt: { lte: periodEnd } } },
    select: { passId: true },
    take: 200000,
  }) : []
  const usedCountByPass = new Map<string, number>()
  for (const u of usages as { passId: string }[]) {
    const id = String(u.passId)
    usedCountByPass.set(id, (usedCountByPass.get(id)||0)+1)
  }
  const outstanding = (activePasses as unknown as { totalPrice: Prisma.Decimal; totalLessons: number; id: string }[]).reduce((s, p) => {
    const per = Math.max(0, Number(p.totalPrice ?? 0)) / Math.max(1, Number(p.totalLessons ?? 0))
    const used = usedCountByPass.get(p.id) || 0
    const totalL = Math.max(0, Number(p.totalLessons || 0))
    const rem = Math.max(0, totalL - used)
    return s + per * rem
  }, 0)
  // Доход (по ТЗ): весь клиентский приход − выплачено логопедам + возвраты логопедов − нал. лог.
  // = totalIncome − (payoutsPos − payoutsNegAbs) − cashTherapistFull
  const profit = Math.round(totalIncome - (Math.max(0, payoutsPos) - Math.max(0, payoutsNegAbs)) - Math.max(0, cashTherapistFull))
  // Итоговый дебет/кредит (как было ранее):
  const finalDebitCredit = profit - outstanding

  // Разрез по логопедам: заработок логопеда = сумма долей по ПОДТВЕРЖДЁННЫМ урокам за период
  const lessonsForPeriod = await prisma.lesson.findMany({
    where: { settledAt: { gte: periodStart, lte: periodEnd }, payoutStatus: 'PAID', ...(hasBranchFilter ? { logoped: { branchId: selBranch } } : (allowedBranchIds.length>0 && role!=='ACCOUNTANT' ? { logoped: { branchId: { in: allowedBranchIds } } } : {})), ...(hasTherapistFilter ? { logopedId: selUserId } : {}) },
    include: { logoped: true, transactions: true, enrolls: { include: { child: true } } },
    orderBy: { settledAt: 'desc' },
    take: 5000,
  })
  const perLogopedMap = new Map<string, { name: string; earning: number }>()
  for (const L of (lessonsForPeriod as unknown as Lesson[])) {
    const lg = L.logoped
    const lid = lg?.id || 'unknown'
    const name = lg?.name || lg?.email || lid
    const share = therapistShareAll(L)
    const prev = perLogopedMap.get(lid) || { name, earning: 0 }
    prev.earning += share
    perLogopedMap.set(lid, prev)
  }
  const perLogopedArr = Array.from(perLogopedMap.entries()).map(([id,v])=>({ id, name: v.name, earning: Math.round(v.earning) }))
    .sort((a,b)=> b.earning - a.earning)
  const perLogopedTotal = perLogopedArr.reduce((s,v)=> s+v.earning, 0)
  // Продажи абонементов (для дальнейшего разреза по клиентам)
  const passesForPeriod = await prisma.pass.findMany({
    where: { createdAt: { gte: periodStart, lte: periodEnd }, ...(hasBranchFilter ? { child: { logoped: { branchId: selBranch } } } : (allowedBranchIds.length>0 && role!=='ACCOUNTANT' ? { child: { logoped: { branchId: { in: allowedBranchIds } } } } : {})), ...(hasTherapistFilter ? { OR: [{ logopedId: selUserId }, { child: { logopedId: selUserId } }] } : {}) },
    include: { child: true },
    orderBy: { createdAt: 'desc' },
    take: 5000,
  })

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-3xl font-bold">Дашборд</h1>
        <form method="get" className="flex items-end gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-muted">Период</span>
            <select name="period" defaultValue={period} className="input input-sm">
              <option value="day">День</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
              <option value="year">Год</option>
            </select>
          </label>
          {branchOptions.length>0 && (
            <label className="grid gap-1">
              <span className="text-xs text-muted">Филиал</span>
              <select name="branch" defaultValue={hasBranchFilter?selBranch:''} className="input input-sm">
                <option value="">Все</option>
                {branchOptions.map(b=> (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
          )}
          {therapists.length>0 && (
            <label className="grid gap-1">
              <span className="text-xs text-muted">Логопед</span>
              <select name="viewUserId" defaultValue={selUserId||''} className="input input-sm">
                <option value="">Все</option>
                {therapists.map(t=> (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          )}
          <button className="btn btn-sm">Показать</button>
        </form>
      </div>
      {sp?.backfilled === '1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800">
          Связи выровнены: уроков обновлено — {Number(sp?.lessons||0)}, транзакций обновлено — {Number(sp?.tx||0)}.
        </div>
      )}
      {sp?.archived === '1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800">
          В архив перенесено транзакций: {Number(sp?.count||0)}.
        </div>
      )}
      {sp?.purged === '1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800">
          Удалено из архива транзакций старше 6 месяцев: {Number(sp?.count||0)}.
        </div>
      )}
      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="card p-3">
          <div className="text-xs text-muted">Общий приход</div>
          <div className="text-2xl font-semibold">{Math.round(totalIncome).toLocaleString('ru-RU')} ₽</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Из него — Абонементы</div>
          <div className="text-2xl font-semibold">{Math.round(subsTotal).toLocaleString('ru-RU')} ₽</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Выплачено работникам</div>
          <div className="mt-1 text-sm">
            <div className="flex items-center justify-between"><span className="text-muted">Выплачено</span><b>{Math.round(payoutsPos).toLocaleString('ru-RU')} ₽</b></div>
            <div className="flex items-center justify-between"><span className="text-muted">Вернул лог.</span><b className="text-red-600">{Math.round(payoutsNegAbs).toLocaleString('ru-RU')} ₽</b></div>
            <div className="flex items-center justify-between"><span className="text-muted">Нал. лог.</span><b>{Math.round(cashTherapistFull).toLocaleString('ru-RU')} ₽</b></div>
            <div className="flex items-center justify-between"><span className="text-muted">Доход лог.</span><b>{Math.round(therapistShareSumAll).toLocaleString('ru-RU')} ₽</b></div>
          </div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Доход</div>
          <div className="text-2xl font-semibold">{Math.round(profit).toLocaleString('ru-RU')} ₽</div>
          {leaderPercent !== null && (
            <>
              <div className="text-[11px] text-muted mt-1">Процент р/л: {leaderPercent}% / {therapistPercent}%</div>
              <div className="text-[11px] text-muted">Доля руководителя от Общего прихода: {(Math.round(totalIncome * (leaderPercent/100))).toLocaleString('ru-RU')} ₽</div>
              <div className="text-[11px] text-muted">Формула дохода: % от Общего прихода + непогаш. абонементы</div>
            </>
          )}
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Остаток непогашенных абонементов</div>
          <div className="text-2xl font-semibold">{Math.round(outstanding).toLocaleString('ru-RU')} ₽</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Итоговый дебет/кредит</div>
          <div className="text-2xl font-semibold">{Math.round(finalDebitCredit).toLocaleString('ru-RU')} ₽</div>
          <div className="text-[11px] text-muted mt-1">Осталось погасить абонементы на сумму {Math.round(outstanding).toLocaleString('ru-RU')} ₽</div>
        </div>
      </section>

      {/* Разрез по логопедам */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="card p-3 overflow-x-auto">
          <div className="mb-2 text-sm font-semibold">Выручка уроков по логопедам</div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2 pr-4">Логопед</th>
                <th className="py-2 pr-4 whitespace-nowrap">Заработок</th>
              </tr>
            </thead>
            <tbody>
              {perLogopedArr.length===0 && (
                <tr><td colSpan={2} className="py-3 text-muted">Нет данных за период</td></tr>
              )}
              {perLogopedArr.map(r=> (
                <tr key={r.id} className="border-t">
                  <td className="py-2 pr-4">{r.name}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{r.earning.toLocaleString('ru-RU')} ₽</td>
                </tr>
              ))}
              {perLogopedArr.length>0 && (
                <tr className="border-t font-semibold">
                  <td className="py-2 pr-4">Итого</td>
                  <td className="py-2 pr-4 whitespace-nowrap">{perLogopedTotal.toLocaleString('ru-RU')} ₽</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="card p-3 overflow-x-auto">
          <div className="mb-2 text-sm font-semibold">Выручка по клиентам</div>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2 pr-4">Клиент</th>
                <th className="py-2 pr-4 whitespace-nowrap">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                // REVENUE по подтвержденным урокам с привязкой к ребёнку
                const revenueTxList = (lessonsForPeriod as Lesson[]).flatMap((L: Lesson)=> (L.transactions||[])
                  .filter((t: Tx)=> t.kind==='REVENUE')
                  .map((t: Tx)=> ({ amount: Number(t.amount||0), child: (L.enrolls||[])[0]?.child })))
                // Продажи абонементов
                const subsList = (passesForPeriod as unknown as { totalPrice: Prisma.Decimal; child: Child }[]).map((P)=> ({ amount: Number(P.totalPrice ?? 0), child: P.child }))
                // Суммируем по клиентам
                const byClient = new Map<string, { name: string; sum: number }>()
                const childName = (c: Child | null | undefined) => {
                  if (!c) return undefined
                  const fio = [c?.lastName, c?.firstName, c?.middleName].filter(Boolean).join(' ').trim()
                  return c?.fullName || (fio || undefined) || c?.name || undefined
                }
                const push = (nameRaw: string|undefined|null, amt: number) => {
                  const name = String(nameRaw||'Без имени')
                  const cur = byClient.get(name) || { name, sum: 0 }
                  cur.sum += Math.max(0, amt||0)
                  byClient.set(name, cur)
                }
                for (const r of revenueTxList) push(childName(r.child), r.amount)
                for (const s of subsList) push(childName(s.child), s.amount)
                const arr = Array.from(byClient.values()).sort((a,b)=> b.sum - a.sum)
                const total = arr.reduce((s,v)=> s+v.sum, 0)
                if (arr.length===0) return <tr><td colSpan={2} className="py-3 text-muted">Нет данных за период</td></tr>
                return (
                  <>
                    {arr.map((r)=> (
                      <tr key={r.name} className="border-t">
                        <td className="py-2 pr-4">{r.name}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">{Math.round(r.sum).toLocaleString('ru-RU')} ₽</td>
                      </tr>
                    ))}
                    <tr className="border-t font-semibold">
                      <td className="py-2 pr-4">Итого</td>
                      <td className="py-2 pr-4 whitespace-nowrap">{Math.round(total).toLocaleString('ru-RU')} ₽</td>
                    </tr>
                  </>
                )
              })()}
            </tbody>
          </table>
        </div>
      </section>
      <section className="grid gap-3">
        <div className="card p-3 space-y-3">
          <div className="text-sm font-medium">Архивирование текущего контура</div>
          <form action={archiveScopeTransactions} className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-xs mb-1">С</label>
              <input type="date" name="start" className="input" required />
            </div>
            <div>
              <label className="block text-xs mb-1">По</label>
              <input type="date" name="end" className="input" required />
            </div>
            <button className="btn btn-warning">В архив</button>
          </form>
          <form action={purgeOldArchives}>
            <button className="btn btn-outline btn-sm">Удалить из архива записи старше 6 месяцев</button>
          </form>
          <div>
            <Link href="/admin/finance/archive" className="btn btn-link btn-sm">Открыть архив →</Link>
          </div>
        </div>
      </section>
      <div className="rounded border p-3 bg-amber-50 text-amber-900 flex items-center justify-between">
        <div className="text-sm">Кнопку «Выравнивание связей» используйте, когда необходимо привести старые данные к актуальным связям (уроки ↔ филиал, транзакции ↔ филиал/компания). Архив удаляется через 6 месяцев безвозвратно.</div>
        <form action={backfillLeaderLinks}>
          <button className="btn btn-warning btn-sm">Выравнивание связей</button>
        </form>
      </div>
    </div>
  )
}
