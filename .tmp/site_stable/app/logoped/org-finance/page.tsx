 
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { getCurrentCommissionPercent } from '@/services/finance'
// Заявку на выплату отправляем через API-роут, чтобы избежать ошибок Server Actions
import LessonPreview from '@/components/LessonPreview'
import TransactionsModal from '@/components/TransactionsModal'

export const dynamic = 'force-dynamic'

// Хелпер: метка типа оплаты/транзакции для урока
function paymentLabel(t: any) {
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

export default async function LogopedOrgFinancePage({ searchParams }: { searchParams?: Promise<{ tpage?: string; lpage?: string; hist?: 'week'|'month'|'6m'; hpage?: string; psum?: 'day'|'week'|'month'|'year' }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const userId = (session?.user as any)?.id
  if (!session || role !== 'LOGOPED') return <div className="container py-6">Доступ запрещён</div>

  const me = await (prisma as any).user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } }, ownedCompanies: true, managedBranches: true } })
  const inOrg = Boolean(me?.branchId)
  const isLeader = Boolean((me?.ownedCompanies?.length || 0) > 0 || (me?.managedBranches?.length || 0) > 0)

  if (!inOrg) return <div className="container py-6">Вы не состоите в организации. Этот раздел доступен только логопедам, работающим в филиале.</div>
  if (isLeader) return <div className="container py-6">Вы являетесь руководителем/владельцем. Используйте раздел «Рук. финансы».</div>

  // Организационная сводка: только не-персональные транзакции (DB-level фильтр, fallback JS)
  // SQLite-friendly: забираем без JSON path, фильтруем на JS
  const txForSummaryRaw = await (prisma as any).transaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: { id: true, createdAt: true, kind: true, amount: true, lessonId: true, meta: true },
  })
  const txForSummary: any[] = (txForSummaryRaw as any[]).filter(t => !(t?.meta?.personal === true))
  const orgBalanceHist = txForSummary.filter(t=>t.kind==='THERAPIST_BALANCE').reduce((s,t)=>s+Number(t.amount||0),0)
  const orgCashHeldHist = txForSummary.filter(t=>t.kind==='CASH_HELD').reduce((s,t)=>s+Number(t.amount||0),0)
  const orgPayoutsHist = txForSummary.filter(t=>t.kind==='PAYOUT').reduce((s,t)=>s+Number(t.amount||0),0)

  // Заявка на выплату: состояние кнопки и данные для модала (нужен userId)
  let pendingReq = await (prisma as any).payoutRequest.findFirst({ where: { logopedId: userId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } })
  let autoCancelled = false
  // Авто-аннуляция: если после createdAt появились новые eligible-уроки — отменяем PENDING
  if (pendingReq) {
    try {
      const probe = await (prisma as any).lesson.findMany({
        where: {
          logopedId: userId,
          payoutStatus: 'NONE',
          settledAt: { not: null, gt: (pendingReq as any).createdAt, lt: new Date() },
        },
        include: { transactions: { select: { meta: true } } },
        take: 3,
      })
      const hasNewEligible = (probe as any[]).some(L => (L.transactions||[]).some((t:any)=> t && (t.meta?.personal !== true)))
      if (hasNewEligible) {
        try { await (prisma as any).payoutRequest.update({ where: { id: (pendingReq as any).id }, data: { status: 'CANCELLED' } }) } catch {}
        pendingReq = null
        autoCancelled = true
      }
    } catch {}
  }
  // Считаем eligibleCount на JS: учитываем транзакции, где meta.personal !== true (включая undefined)
  const rawEligible = await (prisma as any).lesson.findMany({
    where: {
      logopedId: userId,
      settledAt: { not: null, lt: new Date() },
      payoutStatus: 'NONE',
    },
    include: { transactions: { select: { meta: true, amount: true, kind: true, createdAt: true } }, enrolls: { include: { child: true } } },
    select: undefined as any,
    take: 500,
  })
  const eligibleFiltered = (rawEligible as any[]).filter(L => (L.transactions||[]).some((t:any)=> t && (t.meta?.personal !== true)))
  const eligibleCount = eligibleFiltered.length
  // Функции определения плательщика и полной цены урока
  const whoPaid = (L: any): 'LEADER'|'THERAPIST'|'UNKNOWN' => {
    const txs = (L.transactions||[]).slice().sort((a:any,b:any)=> new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
    const tx = txs[txs.length-1]
    const mRaw = (tx?.meta?.paymentMethod || tx?.meta?.paymentmethod || '').toString().toLowerCase()
    if (mRaw.includes('cash_therapist') || mRaw.includes('therapist')) return 'THERAPIST'
    if (mRaw.includes('subscription') || mRaw.includes('abon') || mRaw.includes('leader') || mRaw.includes('manager') || mRaw.includes('card') || mRaw.includes('bank') || mRaw.includes('noncash') || mRaw.includes('transfer')) return 'LEADER'
    // эвристика: если есть REVENUE транзакция — считаем оплатой руководителю; если только CASH_HELD — логопеду
    const hasRevenue = (txs||[]).some((t:any)=> t?.kind==='REVENUE')
    const hasCashHeld = (txs||[]).some((t:any)=> t?.kind==='CASH_HELD')
    if (hasRevenue) return 'LEADER'
    if (hasCashHeld) return 'THERAPIST'
    return 'UNKNOWN'
  }
  function fullPrice(L: any): number {
    // 1) nominalPrice из транзакции (надёжен для cash_therapist)
    const txs = (L.transactions||[]).slice().sort((a:any,b:any)=> new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
    const tx = txs[txs.length-1]
    const nominalFromMeta = Number(tx?.meta?.nominalPrice || 0)
    if (nominalFromMeta > 0) return Math.round(nominalFromMeta)
    // 2) REVENUE сумма (надёжно для безнала/абонементов)
    const revenueTx = (txs||[]).find((t:any)=> t?.kind==='REVENUE' && Number(t?.amount||0) > 0)
    if (revenueTx) return Math.round(Number(revenueTx.amount||0))
    // 3) снимки долей
    const sumShares = Number(L.therapistShareAtTime||0) + Number(L.leaderShareAtTime||0)
    if (sumShares > 0) return Math.round(sumShares)
    // 4) тариф ребёнка
    const rate = Number((L.enrolls||[])[0]?.child?.rateLesson || 0)
    return Math.max(0, Math.round(rate))
  }
  // По незакрытым занятиям (eligible) считаем актуальные суммы
  const therapistShare = (L: any): number => {
    const snap = Number(L.therapistShareAtTime || 0)
    if (snap > 0) return Math.round(snap)
    const pct = Number(L.commissionPercentAtTime ?? 50)
    return Math.round(Math.max(0, fullPrice(L) * pct / 100))
  }
  const pendingBalance = eligibleFiltered.reduce((s: number, L: any) => s + therapistShare(L), 0)
  const pendingCashHeld = eligibleFiltered.reduce((s: number, L: any) => s + Number(L.leaderShareAtTime || 0), 0)
  let paidToLeader = 0
  let paidToTherapist = 0
  for (const L of eligibleFiltered) {
    const amt = fullPrice(L)
    const who = whoPaid(L)
    if (who === 'THERAPIST') paidToTherapist += amt
    else if (who === 'LEADER') paidToLeader += amt
    else {
      // если неизвестно, считаем как оплату руководителю (безнал/абонемент по умолчанию)
      paidToLeader += amt
    }
  }
  const totalUnpaidAmount = eligibleFiltered.reduce((s:number,L:any)=> s + fullPrice(L), 0)
  // Итог к выплате по визуалу: что положено логопеду минус то, что он уже получил напрямую
  const orgFinal = pendingBalance - paidToTherapist
  // Текущий процент распределения (логопед/руководитель)
  const therapistPercent = await getCurrentCommissionPercent(userId)
  const leaderPercent = 100 - Number(therapistPercent || 0)
  // История за 6 месяцев: уроки (сумма = цена занятия) + выплаты (исключаются из итога в модуле)
  const sixMonthsAgo = (()=>{ const d=new Date(); d.setMonth(d.getMonth()-6); return d })()
  const histLessons6m = await (prisma as any).lesson.findMany({
    where: { logopedId: userId, settledAt: { not: null, gte: sixMonthsAgo, lt: new Date() } },
    include: { transactions: { select: { meta: true, amount: true, kind: true, createdAt: true } }, enrolls: { include: { child: true } } },
    orderBy: { settledAt: 'desc' },
    take: 1000,
  })
  const histLessonsOrg6m = (histLessons6m as any[]).filter(L => (L.transactions||[]).some((t:any)=> t && (t.meta?.personal !== true)))
  const histPayouts6m = await (prisma as any).transaction.findMany({ where: { userId, kind: 'PAYOUT', createdAt: { gte: sixMonthsAgo } }, orderBy: { createdAt: 'desc' }, take: 1000 })
  const txHistoryItems6m = [
    ...histLessonsOrg6m.map((L:any)=> ({
      id: `L-${L.id}`,
      createdAt: new Date(L.settledAt || L.createdAt).toISOString(),
      kind: 'LESSON',
      amount: Number(fullPrice(L) || 0),
      lessonId: L.id,
      meta: { displayType: paymentLabel((L.transactions||[])[0]) },
    })),
    ...histPayouts6m.map((t:any)=> ({
      id: t.id,
      createdAt: new Date(t.createdAt).toISOString(),
      kind: t.kind,
      amount: Number(t.amount || 0),
      meta: t?.meta ? JSON.parse(JSON.stringify(t.meta)) : undefined,
      lessonId: t.lessonId || null,
    }))
  ].sort((a:any,b:any)=> new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  // Для модального окна «Транзакции»: крайние 15 выплат логопеду
  const last15PayoutsRaw = await (prisma as any).transaction.findMany({
    where: { userId, kind: 'PAYOUT' },
    orderBy: { createdAt: 'desc' },
    take: 15,
  })
  const last15Payouts = (last15PayoutsRaw as any[]).map(t=> ({
    id: String(t.id),
    createdAt: new Date(t.createdAt).toISOString(),
    kind: 'PAYOUT',
    amount: Number(t.amount || 0),
    meta: t?.meta ? JSON.parse(JSON.stringify(t.meta)) : undefined,
    lessonId: t.lessonId || null,
  }))

  // Панель суммарных выплат за период (по умолчанию год, начало — 1 января текущего года)
  const sp = (searchParams ? await searchParams : {}) as { tpage?: string; lpage?: string; hist?: 'week'|'month'|'6m'; hpage?: string; psum?: 'day'|'week'|'month'|'year' }
  const sumPeriod = (sp?.psum === 'day' || sp?.psum === 'week' || sp?.psum === 'month') ? sp.psum : 'year'
  const nowSum = new Date()
  const startOfPeriod = (() => {
    if (sumPeriod === 'day') { const d = new Date(nowSum); d.setHours(0,0,0,0); return d }
    if (sumPeriod === 'week') { const d = new Date(nowSum); d.setDate(d.getDate()-7); return d }
    if (sumPeriod === 'month') { const d = new Date(nowSum); d.setMonth(d.getMonth()-1); return d }
    const d = new Date(nowSum.getFullYear(), 0, 1); return d // year от 1 января
  })()
  let payoutsSum = 0
  try {
    const agg = await (prisma as any).transaction.aggregate({ where: { userId, kind: 'PAYOUT', createdAt: { gte: startOfPeriod } }, _sum: { amount: true } })
    payoutsSum = Number(agg._sum?.amount || 0)
  } catch {
    const raw = await (prisma as any).transaction.findMany({ where: { userId, kind: 'PAYOUT', createdAt: { gte: startOfPeriod } } })
    payoutsSum = (raw as any[]).reduce((s,t)=> s + Number(t.amount||0), 0)
  }

  // Блок 1. Прошедшие занятия в организации без выплаты (только орг, не персональные)
  const lPage = Math.max(1, Number(sp?.lpage || 1))
  const lPageSize = 10
  let orgLessons: any[] = []
  let orgLessonsHasMore = false
  const batchRaw = await (prisma as any).lesson.findMany({
    where: {
      logopedId: userId,
      settledAt: { not: null, lt: new Date() },
      payoutStatus: 'NONE',
    },
    include: {
      enrolls: { include: { child: true } },
      transactions: true,
      evaluations: true,
    },
    orderBy: { settledAt: 'desc' },
    skip: (lPage - 1) * lPageSize,
    take: lPageSize + 1,
  })
  const filteredOrg = (batchRaw as any[]).filter(L => (L.transactions||[]).some((t:any)=> t?.meta?.personal !== true))
  orgLessonsHasMore = filteredOrg.length > lPageSize
  orgLessons = filteredOrg.slice(0, lPageSize)

  const txTypeLabel = (t: any) => {
    const kind = String(t?.kind || '').toUpperCase()
    if (kind === 'PAYOUT') return 'Выплата'
    // Для остальных показываем метод оплаты согласно ТЗ
    return paymentLabel(t)
  }

  // Формат даты: "29 сент. 19:30"
  const formatRuDateTime = (date: Date | string | null | undefined) => {
    if (!date) return '—'
    const d = new Date(date)
    return d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  }

  // Блок 2. История транзакций за 6 месяцев с фильтром
  const histPeriod = (sp?.hist === 'month' || sp?.hist === '6m') ? sp.hist : 'week'
  const histPage = Math.max(1, Number(sp?.hpage || 1))
  const hPageSize = 10
  const now = new Date()
  const histFrom = (() => {
    if (histPeriod === 'week') { const d = new Date(now); d.setDate(d.getDate()-7); return d }
    if (histPeriod === 'month') { const d = new Date(now); d.setMonth(d.getMonth()-1); return d }
    const d = new Date(now); d.setMonth(d.getMonth()-6); return d
  })()
  let histTx: any[] = []
  let histHasMore = false
  const txBatchRaw = await (prisma as any).transaction.findMany({
    where: { userId, createdAt: { gte: histFrom } },
    orderBy: { createdAt: 'desc' },
    skip: (histPage - 1) * hPageSize,
    take: hPageSize + 1,
  })
  const filteredHist = (txBatchRaw as any[]).filter(t => !(t?.meta?.personal === true))
  histHasMore = filteredHist.length > hPageSize
  histTx = filteredHist.slice(0, hPageSize)

  // Для блока истории подтянем уроки для модала
  const histLessonIds = Array.from(new Set((histTx || []).map((t:any)=> t.lessonId).filter(Boolean)))
  const histLessons = histLessonIds.length>0 ? await (prisma as any).lesson.findMany({
    where: { id: { in: histLessonIds } },
    include: { enrolls: { include: { child: true } }, evaluations: true, transactions: true },
  }) : []
  const histLessonById = new Map<string, any>(histLessons.map((l:any)=> [l.id, l]))
  // Итог по истории: без учёта выплат (PAYOUT) и с ценой урока как fullPrice
  const histTotalExclPayout = (histTx as any[]).reduce((s:number,t:any)=>{
    const isPayout = String(t?.kind||'').toUpperCase()==='PAYOUT'
    if (isPayout) return s
    const L = t.lessonId ? histLessonById.get(t.lessonId) : null
    const amount = L ? fullPrice(L) : Number(t.amount||0)
    return s + Number(amount||0)
  }, 0)

  // старый список уроков ниже страницы удалён

  async function AbonementsBlock({ userId }: { userId: string }) {
    const passes = await (prisma as any).pass.findMany({
      where: { logopedId: userId, remainingLessons: { gt: 0 } },
      include: { child: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    if (!passes || passes.length===0) {
      return <div className="text-sm text-muted">Абонементов нет</div>
    }
    return (
      <div className="overflow-x-auto card-table p-3">
        <table className="min-w-full text-sm table-zebra leading-tight">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-4">Имя</th>
              <th className="py-2 pr-4">Кол-во</th>
              <th className="py-2 pr-4">Ост.</th>
              <th className="py-2 pr-4">Цена абонемента</th>
              <th className="py-2 pr-4">Действ. до</th>
            </tr>
          </thead>
          <tbody>
            {passes.map((p:any)=> (
              <tr key={p.id}>
                <td className="py-2 pr-4">{`${p.child?.lastName || ''} ${p.child?.firstName || ''}`.trim() || '—'}</td>
                <td className="py-2 pr-4">{p.totalLessons ?? '—'}</td>
                <td className="py-2 pr-4">{p.remainingLessons ?? '—'}</td>
                <td className="py-2 pr-4">{Number(p.totalPrice||0).toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4">{p.validUntil ? new Date(p.validUntil).toLocaleDateString('ru-RU') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-muted">Занятия учитываются в организации: {me?.branch?.name || 'Филиал'} · {me?.branch?.company?.name || 'Компания'}</div>
        <div className="flex items-center gap-3 text-sm">
          <div className="text-muted">Сумма выплат:</div>
          <div className="font-semibold">{payoutsSum.toLocaleString('ru-RU')} ₽</div>
          <div className="flex gap-1">
            <Link href={`/logoped/org-finance?psum=day`} className={`btn btn-xs ${sumPeriod==='day'?'btn-secondary':''}`}>Д</Link>
            <Link href={`/logoped/org-finance?psum=week`} className={`btn btn-xs ${sumPeriod==='week'?'btn-secondary':''}`}>Н</Link>
            <Link href={`/logoped/org-finance?psum=month`} className={`btn btn-xs ${sumPeriod==='month'?'btn-secondary':''}`}>М</Link>
            <Link href={`/logoped/org-finance?psum=year`} className={`btn btn-xs ${sumPeriod==='year'?'btn-secondary':''}`}>Г</Link>
          </div>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="card p-3">
          <div className="text-xs text-muted">Приход общий (незакрытые)</div>
          <div className="text-2xl font-semibold">{totalUnpaidAmount.toLocaleString('ru-RU')} ₽</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Оплатили руководителю</div>
          <div className="text-2xl font-semibold">{paidToLeader.toLocaleString('ru-RU')} ₽</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Оплатили логопеду</div>
          <div className="text-2xl font-semibold">{paidToTherapist.toLocaleString('ru-RU')} ₽</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Итог к выплате</div>
          <div className={`text-2xl font-semibold ${orgFinal>=0?'text-emerald-600':'text-red-600'}`}>
            {orgFinal<0 ? `верни руководителю ${Math.abs(orgFinal).toLocaleString('ru-RU')} ₽` : `${orgFinal.toLocaleString('ru-RU')} ₽`}
          </div>
          <div className="text-xs text-muted mt-1">Текущий процент р/л: {leaderPercent}% / {therapistPercent}%</div>
        </div>
      </section>

      {autoCancelled && (
        <div className="rounded border p-3 bg-amber-50 text-amber-900 text-sm">
          Заявка на выплату аннулирована, так как после запроса появились новые занятия. Отправьте новую заявку, чтобы учесть все занятия.
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {!pendingReq ? (
          eligibleCount>0 ? (
            <form action="/api/payout-request" method="post">
              <button className="btn btn-primary" type="submit">Запросить выплату</button>
            </form>
          ) : (
            <button className="btn" disabled>Выплат нет</button>
          )
        ) : (
          <form action="/api/payout-request/cancel" method="post">
            <input type="hidden" name="requestId" value={pendingReq.id} />
            <button className="btn btn-danger" type="submit">Отменить запрос</button>
          </form>
        )}
        <TransactionsModal trigger={<span>Транзакции</span>} items={last15Payouts as any} />
      </div>
      <div className="mt-1 text-xs text-muted">
        К выплате уроков: <b>{eligibleCount}</b>
        {pendingReq && (
          <>
            {' '}· Запрошено: <b>{Number((pendingReq as any)?.finalAmount || 0).toLocaleString('ru-RU')} ₽</b>
            {' '}от {new Date((pendingReq as any)?.createdAt).toLocaleString('ru-RU')}
          </>
        )}
      </div>

      {/* Блок 1: Прошедшие занятия в организации без выплаты */}
      <section className="section">
        <div className="mb-3 pb-2 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Прошедшие занятия (без выплаты)</h2>
        </div>
        <div className="overflow-x-auto card-table p-3">
          <table className="min-w-full text-sm table-zebra leading-tight">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2 pr-4">Дата</th>
                <th className="py-2 pr-4">Тип</th>
                <th className="py-2 pr-4 text-right">Сумма</th>
                <th className="py-2 pr-4">Урок</th>
              </tr>
            </thead>
            <tbody>
              {orgLessons.length===0 && (
                <tr><td colSpan={4} className="py-3 text-muted">Нет занятий</td></tr>
              )}
              {orgLessons.map((L: any) => {
                const child = (L.enrolls||[])[0]?.child
                const childName = child ? `${child.lastName || ''} ${child.firstName || ''}`.trim() : '—'
                const initial = (child?.lastName || '').trim().charAt(0).toUpperCase()
                const when = new Date(L.startsAt)
                const price = fullPrice(L)
                const t = (L.transactions||[])[0]
                const type = paymentLabel(t)
                return (
                  <tr key={L.id}>
                    <td className="py-2 pr-4">{formatRuDateTime(when)}</td>
                    <td className="py-2 pr-4">{type}</td>
                    <td className="py-2 pr-4 text-right">{Math.round(price).toLocaleString('ru-RU')} ₽</td>
                    <td className="py-2 pr-4">
                      <LessonPreview
                        trigger={<span className="underline cursor-pointer">{child ? `${child.firstName} ${initial}.` : '—'}</span>}
                        child={{ name: childName, photoUrl: child?.photoUrl }}
                        evaluations={L.evaluations}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {orgLessonsHasMore && (
          <div className="mt-3">
            <a className="btn btn-outline" href={`/logoped/org-finance?lpage=${lPage+1}`}>Показать ещё</a>
          </div>
        )}
      </section>

      {/* Блок 1.5: Абонементы (информационный) */}
      <section className="section">
        <div className="mb-3 pb-2 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Абонементы</h2>
        </div>
        <AbonementsBlock userId={userId} />
      </section>

      {/* Блок 2: История транзакций за 6 месяцев */}
      <section className="section">
        <div className="mb-3 pb-2 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">История транзакций (за 6 месяцев)</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">Период:</span>
            <Link href={`/logoped/org-finance?hist=week`} className={`btn btn-sm ${histPeriod==='week'?'btn-secondary':''}`}>Неделя</Link>
            <Link href={`/logoped/org-finance?hist=month`} className={`btn btn-sm ${histPeriod==='month'?'btn-secondary':''}`}>Месяц</Link>
            <Link href={`/logoped/org-finance?hist=6m`} className={`btn btn-sm ${histPeriod==='6m'?'btn-secondary':''}`}>6 мес</Link>
          </div>
        </div>
        <div className="overflow-x-auto card-table p-3">
          <table className="min-w-full text-sm table-zebra leading-tight">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2 pr-4">Дата</th>
                <th className="py-2 pr-4">Тип</th>
                <th className="py-2 pr-4 text-right">Сумма</th>
                <th className="py-2 pr-4">Урок</th>
              </tr>
            </thead>
            <tbody>
              {histTx.length===0 && (
                <tr><td colSpan={4} className="py-3 text-muted">Нет транзакций за выбранный период</td></tr>
              )}
              {histTx.map((t:any)=> {
                const L = (t.lessonId ? histLessonById.get(t.lessonId) : null) as any
                const child = L ? ((L?.enrolls||[])[0]?.child) : null
                const childName = child ? `${child.lastName || ''} ${child.firstName || ''}`.trim() : ''
                const initial = (child?.lastName || '').trim().charAt(0).toUpperCase()
                const isPayout = String(t?.kind||'').toUpperCase()==='PAYOUT'
                const amount = L ? fullPrice(L) : Number(t.amount||0)
                return (
                  <tr key={t.id}>
                    <td className="py-2 pr-4">{formatRuDateTime(L?.startsAt || t.createdAt)}</td>
                    <td className="py-2 pr-4">
                      <span>{txTypeLabel(t)}</span>
                      {isPayout && <span className="ml-2 inline-block text-xs text-muted border rounded px-1 py-0.5">вне ИТОГО</span>}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <span className={`${isPayout?'text-muted':''}`}>{Number(amount||0).toLocaleString('ru-RU')} ₽</span>
                    </td>
                    <td className="py-2 pr-4">
                      {isPayout ? (
                        <span className="text-red-600">Вне ИТОГО</span>
                      ) : L && child ? (
                        <LessonPreview
                          trigger={<span className="underline cursor-pointer">{`${child?.firstName} ${initial}.`}</span>}
                          child={{ name: childName, photoUrl: child?.photoUrl }}
                          evaluations={L?.evaluations}
                        />
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="py-2 pr-4 font-semibold">ИТОГО</td>
                <td className="py-2 pr-4"></td>
                <td className="py-2 pr-4 font-semibold text-right">{histTotalExclPayout.toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
        {histHasMore && (
          <div className="mt-3">
            <a className="btn btn-outline" href={`/logoped/org-finance?hist=${histPeriod}&hpage=${histPage+1}`}>Показать ещё</a>
          </div>
        )}
      </section>

      {/* удалён старый нижний блок */}
    </div>
  )
}
