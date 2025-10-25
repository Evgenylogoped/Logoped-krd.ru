import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCurrentCommissionPercent } from '@/services/finance'
import { computeSettlement, computeSettlementWindow } from '@/lib/settlement'
import LessonsModal, { LessonRow } from '@/components/finance/LessonsModal'
import AutoRefresh from '@/components/AutoRefresh'
import BranchSelector from '@/components/finance/BranchSelector'
// confirm payout через API роут, чтобы не зависеть от Server Actions

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function AdminFinancePayoutsPage({ searchParams }: { searchParams?: Promise<{ year?: string; export?: string; period?: 'week'|'month'|'6m'|'year'; uid?: string; upage?: string; branch?: string }> }) {
  const sp = (searchParams ? await searchParams : {}) as { year?: string; export?: string; period?: 'week'|'month'|'6m'|'year'; uid?: string; upage?: string; branch?: string }
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const adminId = (session?.user as any)?.id
  if (!session) return <div className="container py-6">Доступ запрещён</div>
  let allowed = ['ADMIN','SUPER_ADMIN'].includes(role)
  if (!allowed && role === 'LOGOPED') {
    const meGuard = await (prisma as any).user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
    const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: adminId }, select: { id: true } })
    const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: adminId }, select: { id: true } })
    const isOwnerGuard = Boolean(meGuard?.branch?.company?.ownerId === adminId) || Boolean(ownedCompany)
    const isBranchManagerGuard = Boolean(meGuard?.branch?.managerId === adminId) || Boolean(managesAny)
    allowed = isOwnerGuard || isBranchManagerGuard
  }
  if (!allowed) return <div className="container py-6">Доступ запрещён</div>

  const branchFilterId = String(sp?.branch || '').trim()

  // Список филиалов для селектора (админы/бухгалтеры — все; владелец — свои; менеджер — свой)
  let branches: { id: string; name: string }[] = []
  if (['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) {
    branches = await (prisma as any).branch.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 })
  } else {
    const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: adminId }, select: { id: true } })
    if (ownedCompany) {
      branches = await (prisma as any).branch.findMany({ where: { companyId: ownedCompany.id }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 })
    } else {
      const me = await (prisma as any).user.findUnique({ where: { id: adminId }, select: { branchId: true } })
      if (me?.branchId) {
        const b = await (prisma as any).branch.findUnique({ where: { id: me.branchId }, select: { id: true, name: true } })
        if (b) branches = [b]
      }
    }
  }

  let requests = await (prisma as any).payoutRequest.findMany({
    where: { status: 'PENDING', ...(branchFilterId ? { logoped: { branchId: branchFilterId } } : {}) },
    orderBy: { createdAt: 'desc' },
    include: { logoped: true },
    take: 50,
  })

  const pendingCount = requests.length
  const uniqueLogopeds = new Set<string>(requests.map((r:any)=> r.logopedId)).size
  // Авторасчёт сумм по урокам для PENDING
  const pendingAmounts: Record<string, number> = {}
  const pendingBalances: Record<string, number> = {}
  const pendingCashTherapist: Record<string, number> = {}
  const pendingFullSums: Record<string, number> = {}
  for (const r of requests as any[]) {
    if (r.status !== 'PENDING') continue
    const lessons = await (prisma as any).lesson.findMany({
      where: { logopedId: r.logopedId, payoutStatus: 'NONE', settledAt: { lte: r.createdAt } },
      include: { transactions: { select: { meta: true, amount: true, kind: true, createdAt: true } }, enrolls: { include: { child: true } } },
      select: undefined as any,
      take: 5000,
    })
    const eligible = (lessons as any[]).filter(L => !((L.transactions||[]).some((t:any)=> t && (t.meta?.personal === true))))
    const currentPercent = await getCurrentCommissionPercent(r.logopedId)
    // helpers
    const whoPaid = (L: any): 'LEADER'|'THERAPIST'|'UNKNOWN' => {
      const txs = (L.transactions||[]).slice().sort((a:any,b:any)=> new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
      const tx = txs[txs.length-1]
      const mRaw = (tx?.meta?.paymentMethod || tx?.meta?.paymentmethod || '').toString().toLowerCase()
      if (mRaw.includes('cash_therapist') || mRaw.includes('therapist')) return 'THERAPIST'
      if (mRaw.includes('subscription') || mRaw.includes('abon') || mRaw.includes('leader') || mRaw.includes('manager') || mRaw.includes('card') || mRaw.includes('bank') || mRaw.includes('noncash') || mRaw.includes('transfer')) return 'LEADER'
      const hasRevenue = (txs||[]).some((t:any)=> t?.kind==='REVENUE')
      const hasCashHeld = (txs||[]).some((t:any)=> t?.kind==='CASH_HELD')
      if (hasRevenue) return 'LEADER'
      if (hasCashHeld) return 'THERAPIST'
      return 'UNKNOWN'
    }
    const fullPrice = (L: any): number => {
      const txs = (L.transactions||[]).slice().sort((a:any,b:any)=> new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
      const tx = txs[txs.length-1]
      const nominalFromMeta = Number(tx?.meta?.nominalPrice || 0)
      if (nominalFromMeta > 0) return Math.round(nominalFromMeta)
      const revenueTx = (txs||[]).find((t:any)=> t?.kind==='REVENUE' && Number(t?.amount||0) > 0)
      if (revenueTx) return Math.round(Number(revenueTx.amount||0))
      const sumShares = Number(L.therapistShareAtTime||0) + Number(L.leaderShareAtTime||0)
      if (sumShares > 0) return Math.round(sumShares)
      const rate = Number((L.enrolls||[])[0]?.child?.rateLesson || 0)
      return Math.max(0, Math.round(rate))
    }
    const therapistShare = (L: any): number => {
      if (typeof L.therapistShareAtTime === 'number' && !Number.isNaN(L.therapistShareAtTime)) return Math.round(Number(L.therapistShareAtTime))
      const base = Number(L.revenueAtTime || 0) || fullPrice(L)
      const pct = Number(L.commissionPercentAtTime || 0) || Number(currentPercent || 0) || 50
      return (base>0 && pct>0) ? Math.round(base*pct/100) : 0
    }
    const pendingBalance = (eligible as any[]).reduce((acc, L:any)=> acc + therapistShare(L), 0)
    let paidToTherapist = 0
    for (const L of eligible as any[]) { if (whoPaid(L) === 'THERAPIST') paidToTherapist += fullPrice(L) }
    const fullSum = (eligible as any[]).reduce((acc,L:any)=> acc + fullPrice(L), 0)
    pendingBalances[r.id] = pendingBalance
    pendingCashTherapist[r.id] = paidToTherapist
    pendingFullSums[r.id] = fullSum
    pendingAmounts[r.id] = Math.max(0, pendingBalance - paidToTherapist)
  }
  const totalPendingAmount = Object.values(pendingAmounts).reduce((a,b)=>a+b,0)

  // Предпросмотр уроков, которые будут включены при подтверждении (только для PENDING)
  const previews: Record<string, { count: number; lessonIds: string[]; rows: LessonRow[] }> = {}
  const paymentLabel = (t: any) => {
    const m = (t?.meta?.paymentMethod || t?.meta?.paymentmethod || '').toString().toLowerCase()
    if (!m) {
      const kind = String(t?.kind || '').toUpperCase()
      if (kind === 'CASH_HELD') return 'нал. лог.'
      if (kind === 'THERAPIST_BALANCE') return 'безнал. рук.'
      return 'Транзакция'
    }
    if (m.includes('subscription') || m.includes('abon')) return 'Абонемент'
    if (m.includes('cash_therapist') || m.includes('therapist')) return 'нал. лог.'
    if (m.includes('cash_leader') || m.includes('leader') || m.includes('manager')) return 'нал. рук.'
    if (m.includes('card') || m.includes('bank') || m.includes('noncash') || m.includes('transfer')) return 'безнал. рук.'
    return 'Транзакция'
  }
  for (const r of requests) {
    if (r.status === 'PENDING') {
      const lessons = await (prisma as any).lesson.findMany({
        where: { logopedId: r.logopedId, payoutStatus: 'NONE', settledAt: { lte: r.createdAt } },
        include: { transactions: true, enrolls: { include: { child: true } } },
        select: undefined as any,
        take: 1000,
      })
      const eligible = (lessons as any[]).filter(L => !((L.transactions||[]).some((t:any)=> t && (t.meta?.personal === true))))
      const currentPercentForRows = await getCurrentCommissionPercent(r.logopedId)
      const rows: LessonRow[] = (eligible as any[]).map((L:any)=> {
        const txs = (L.transactions||[]).slice().sort((a:any,b:any)=> new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
        const lastTx = txs[txs.length-1]
        const price = (()=>{
          // 1) любая мета nominalPrice
          const anyNominal = (txs||[]).map((t:any)=> Number(t?.meta?.nominalPrice || 0)).find((v:number)=> v>0)
          if (anyNominal && anyNominal > 0) return Math.round(anyNominal)
          // 2) REVENUE
          const revenueTx = (txs||[]).find((t:any)=> t?.kind==='REVENUE' && Number(t?.amount||0) > 0)
          if (revenueTx) return Math.round(Number(revenueTx.amount||0))
          // 3) CASH_THERAPIST восстановление по лидерской доле
          const hasCashHeld = (txs||[]).some((t:any)=> String(t?.kind||'').toUpperCase()==='CASH_HELD')
          const pct = Number(L.commissionPercentAtTime || 0) || Number(currentPercentForRows || 0) || 50
          const leader = Number(L.leaderShareAtTime || 0)
          if (hasCashHeld && leader > 0 && pct>0 && pct<100) {
            const nominal = Math.round(leader * 100 / (100 - pct))
            if (nominal > 0) return nominal
          }
          // 4) сумма долей
          const sumShares = Number(L.therapistShareAtTime||0) + Number(L.leaderShareAtTime||0)
          if (sumShares > 0) return Math.round(sumShares)
          // 5) тариф ребёнка
          const rate = Number((L.enrolls||[])[0]?.child?.rateLesson || 0)
          return Math.max(0, Math.round(rate))
        })()
        return {
          when: new Date(L.startsAt || L.settledAt || L.createdAt).toLocaleString('ru-RU', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }),
          type: paymentLabel(lastTx),
          price,
          childName: `${((L.enrolls||[])[0]?.child?.lastName||'')} ${((L.enrolls||[])[0]?.child?.firstName||'')}`.trim() || '—',
        }
      })
      previews[r.id] = { count: eligible.length, lessonIds: eligible.map((l: any) => l.id).slice(0,200), rows }
    }
  }

  // ==== Блок «Выплачено (период)» ====
  const period = (sp?.period === 'month' || sp?.period === '6m' || sp?.period === 'year') ? sp.period! : 'week'
  const now = new Date()
  const jan1Next = new Date(now.getFullYear() + 1, 0, 1)
  const msLeft = jan1Next.getTime() - now.getTime()
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000*60*60*24)))
  let from: Date
  let to: Date | undefined
  if (period === 'week') { const d = new Date(now); d.setDate(d.getDate()-7); from = d }
  else if (period === 'month') { const d = new Date(now); d.setMonth(d.getMonth()-1); from = d }
  else if (period === '6m') { const d = new Date(now); d.setMonth(d.getMonth()-6); from = d }
  else { from = new Date(now.getFullYear(), 0, 1); to = new Date(now.getFullYear()+1, 0, 1) }
  const paidWhere: any = { kind: 'PAYOUT', createdAt: { gte: from } }
  if (to) paidWhere.createdAt.lt = to
  // Ограничим выплаты по филиалу, если выбран
  let paidTx = await (prisma as any).transaction.findMany({ where: paidWhere, orderBy: { createdAt: 'desc' }, take: 10000 })
  if (branchFilterId) {
    const branchUsers = await (prisma as any).user.findMany({ where: { branchId: branchFilterId }, select: { id: true } })
    const allowed = new Set((branchUsers as any[]).map(u=> u.id as string))
    paidTx = (paidTx as any[]).filter(t => allowed.has((t as any).userId))
  }
  // Группируем по логопедам
  const byUser: Record<string, { sum: number; tx: any[] }> = {}
  for (const t of paidTx) {
    const uid = (t as any).userId as string
    if (!uid) continue
    if (!byUser[uid]) byUser[uid] = { sum: 0, tx: [] }
    byUser[uid].sum += Number((t as any).amount || 0)
    byUser[uid].tx.push(t)
  }
  const userIds = Object.keys(byUser)
  const users = userIds.length ? await (prisma as any).user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : []
  const userMap = new Map<string, { id: string; name?: string|null; email?: string|null }>(
    (users as any[]).map((u:any)=> [u.id as string, u as { id: string; name?: string|null; email?: string|null }])
  )
  // Пагинация по пользователю: по 5 записей, через uid/upage
  const focusedUid = sp?.uid || ''
  const upage = Math.max(1, Number(sp?.upage || 1))
  const pageSize = 5

  // Единая модель расчёта через computeSettlement
  const cashByUser: Record<string, number> = {}
  const shareByUser: Record<string, number> = {}
  const netByUser: Record<string, number> = {}
  for (const uid of userIds) {
    const { cashTher, tshare, net } = await computeSettlement(uid, period)
    cashByUser[uid] = Math.max(0, Number(cashTher||0))
    shareByUser[uid] = Math.max(0, Number(tshare||0))
    netByUser[uid] = Number(net||0)
  }

  // Предрасчёт предпросмотра по окнам ДЛЯ ВСЕХ строк периода (не только текущей страницы)
  const previewDeltaByUser: Record<string, Record<string, number>> = {}
  for (const uid of userIds) {
    const list = byUser[uid].tx
    // Построим карту предыдущих выплат по всему списку
    let prevTime: Date | null = null
    const ordered = list.slice().sort((a:any,b:any)=> new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    const prevById = new Map<string, Date | null>()
    for (const t of ordered as any[]) { prevById.set(t.id, prevTime); prevTime = new Date(t.createdAt) }

    const tasks: Promise<void>[] = []
    const map: Record<string, number> = {}
    for (const t of list as any[]) {
      const amt = Number(t.amount||0)
      if (amt !== 0) continue
      const toD = new Date(t.createdAt)
      const fromD = prevById.get(t.id) || new Date(new Date(toD.getFullYear(),0,1))
      tasks.push((async()=>{
        const win = await computeSettlementWindow(uid, fromD as Date, toD)
        map[t.id] = Number(win.net||0)
      })())
    }
    if (tasks.length) await Promise.all(tasks)
    previewDeltaByUser[uid] = map
  }

  return (
    <div className="container py-6 space-y-4">
      {/* автообновление каждые 5 сек */}
      <AutoRefresh intervalMs={15000} />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-3xl font-bold">Выплаты</h1>
        <div className="flex items-center gap-3">
          {branches.length>0 && (
            <BranchSelector branches={branches} allLabel="Все филиалы" param="branch" />
          )}
          <div className="text-xs text-muted">Транзакции у руководителя хранятся 1 год (до 31 декабря), с 1 января начинается новый период</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="badge badge-info">В ожидании: {pendingCount}</span>
        <span className="badge badge-gray">Логопедов: {uniqueLogopeds}</span>
        <span className="badge badge-green">Сумма: {totalPendingAmount.toLocaleString('ru-RU')} ₽</span>
      </div>
      <div className="overflow-x-auto card-table p-3">
        <table className="min-w-full text-sm table-zebra leading-tight">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-4">Дата</th>
              <th className="py-2 pr-4">Логопед</th>
              <th className="py-2 pr-4 hidden sm:table-cell">Сумма уроков</th>
              <th className="py-2 pr-4 hidden sm:table-cell">Доля логопеда</th>
              <th className="py-2 pr-4 hidden sm:table-cell">Нал. лог.</th>
              <th className="py-2 pr-4">К выплате</th>
              <th className="py-2 pr-4 hidden sm:table-cell">Уроки</th>
              <th className="py-2 pr-4">Статус</th>
            </tr>
          </thead>
          <tbody>
            {requests.length===0 && (
              <tr><td colSpan={7} className="py-3 text-muted">Запросов на выплату нет</td></tr>
            )}
            {requests.map((r: any) => (
              <tr key={r.id}>
                <td className="py-2 pr-4">{new Date(r.createdAt).toLocaleString('ru-RU')}</td>
                <td className="py-2 pr-4">{r.logoped?.name || r.logoped?.email}</td>
                <td className="py-2 pr-4 hidden sm:table-cell">{Number(pendingFullSums[r.id]||0).toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4 hidden sm:table-cell">{Number(pendingBalances[r.id]||0).toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4 hidden sm:table-cell">{Number(pendingCashTherapist[r.id]||0).toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4 align-top">
                  {(() => {
                    const amt = Number(pendingAmounts[r.id]||0)
                    if (amt > 0) return <span>{amt.toLocaleString('ru-RU')} ₽</span>
                    const balance = Number(pendingBalances[r.id]||0)
                    const cashTher = Number(pendingCashTherapist[r.id]||0)
                    const delta = balance - cashTher // может быть отрицательным
                    if (delta < 0) {
                      return (
                        <div className="leading-tight">
                          <div className="text-red-600">{delta.toLocaleString('ru-RU')} ₽</div>
                          <div className="text-[11px] text-red-600">возьми с логопеда</div>
                        </div>
                      )
                    }
                    return <span className="text-muted">0 ₽</span>
                  })()}
                </td>
                <td className="py-2 pr-4 align-top hidden sm:table-cell">
                  {r.status==='PENDING' ? (
                    <div className="text-xs">
                      <div>Будет включено уроков: <b>{previews[r.id]?.count ?? 0}</b></div>
                      {(previews[r.id]?.lessonIds?.length ?? 0) > 0 && (
                        <LessonsModal
                          trigger={<span className="cursor-pointer text-muted">Показать детали</span>}
                          rows={previews[r.id]!.rows}
                          title="Прошедшие занятия (без выплаты)"
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <span>{r.status==='PENDING'?'Ожидает':r.status==='PAID'?'Выплачено':r.status==='CANCELLED'?'Отменён':r.status}</span>
                    {r.status==='PENDING' && (
                      <form action="/api/payouts/confirm" method="post" className="flex items-center gap-2">
                        <input type="hidden" name="payoutId" value={r.id} />
                        <button className="btn btn-primary btn-sm" type="submit">Подтвердить</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-sm text-muted">Подтверждение выплат и включение уроков добавим следующим шагом (server actions).      </div>

      {/* Выплачено (период) */}
      <section className="section">
        <div className="mb-3 pb-2 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Выплачено (период)
            <span className="ml-2 text-xs text-muted">До сброса {daysLeft} дн.</span>
          </h2>
          <div className="flex items-center gap-2 text-sm">
            <a className={`btn btn-sm ${period==='week'?'btn-secondary':''}`} href={`/admin/finance/payouts?period=week`}>Неделя</a>
            <a className={`btn btn-sm ${period==='month'?'btn-secondary':''}`} href={`/admin/finance/payouts?period=month`}>Месяц</a>
            <a className={`btn btn-sm ${period==='6m'?'btn-secondary':''}`} href={`/admin/finance/payouts?period=6m`}>6 мес.</a>
            <a className={`btn btn-sm ${period==='year'?'btn-secondary':''}`} href={`/admin/finance/payouts?period=year`}>Год</a>
          </div>
        </div>
        <div className="space-y-4">
          {userIds.length===0 && (
            <div className="text-sm text-muted">Нет выплат за выбранный период</div>
          )}
          {userIds.map(uid => {
            const user = userMap.get(uid)
            const list = byUser[uid].tx
            const page = (focusedUid===uid ? upage : 1)
            const start = (page-1)*pageSize
            const slice = list.slice(start, start+pageSize)
            const hasMore = start + pageSize < list.length
            const total = byUser[uid].sum
            const previewDeltaById = previewDeltaByUser[uid] || {}
            // Итоги ЗА ВЕСЬ период по пользователю (независимо от пагинации)
            const deltasAll = (list as any[]).map((t:any) => { const a = Number(t.amount||0); return a!==0 ? a : Number(previewDeltaById[t.id]||0) })
            const sumPosAll = deltasAll.reduce((s:number,v:number)=> s + (v>0?v:0), 0)
            const sumNegAll = deltasAll.reduce((s:number,v:number)=> s + (v<0?Math.abs(v):0), 0)
            return (
              <div key={uid} className="card-table p-3">
                <div className="mb-2 font-semibold">{user?.name || user?.email || uid}</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm table-zebra leading-tight">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="py-2 pr-4">Дата</th>
                        <th className="py-2 pr-4 text-right">Возврат</th>
                        <th className="py-2 pr-4 text-right">Выплата</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice.map((t:any) => {
                        const amt = Number(t.amount||0)
                        const delta = amt===0 ? Number(previewDeltaById[t.id]||0) : amt
                        const neg = delta < 0 ? Math.abs(delta) : 0
                        const pos = delta > 0 ? delta : 0
                        return (
                          <tr key={t.id}>
                            <td className="py-2 pr-4">{new Date(t.createdAt).toLocaleString('ru-RU')}</td>
                            <td className="py-2 pr-4 text-right text-red-600">{neg>0?`−${neg.toLocaleString('ru-RU')} ₽`:'0 ₽'}</td>
                            <td className="py-2 pr-4 text-right">{pos>0?`${pos.toLocaleString('ru-RU')} ₽`:'0 ₽'}</td>
                          </tr>
                        )
                      })}
                      <tr>
                        <td className="py-2 pr-4 font-semibold">ИТОГО (за период)</td>
                        <td className="py-2 pr-4 font-semibold text-right">{sumNegAll.toLocaleString('ru-RU')} ₽</td>
                        <td className="py-2 pr-4 font-semibold text-right">{sumPosAll.toLocaleString('ru-RU')} ₽</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {/* Сводка по периоду на основе окон (факт + предпросмотр) */}
                {(() => {
                  const net = sumPosAll - sumNegAll
                  return (
                    <div className="mt-2 text-xs text-muted">
                      Возврат (лог. → рук.): <b>{sumNegAll.toLocaleString('ru-RU')} ₽</b>
                      {' '}· Выплата (рук. → лог.): <b>{sumPosAll.toLocaleString('ru-RU')} ₽</b>
                      {' '}· Разница: <b>{net.toLocaleString('ru-RU')} ₽</b>
                      {' '}· Показано: {slice.length} из {list.length}
                    </div>
                  )
                })()}
                {hasMore && (
                  <div className="mt-2">
                    <a className="btn btn-outline btn-sm" href={`/admin/finance/payouts?period=${period}&uid=${uid}&upage=${page+1}`}>Показать ещё</a>
                  </div>
                )}
                
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )

}
