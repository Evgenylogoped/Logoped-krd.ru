import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getCurrentCommissionPercent } from '@/services/finance'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  const role = (session?.user as any)?.role as string | undefined
  const r = role ?? ''
  if (!session || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(r)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Если есть незакрытая заявка — редиректим на страницу с сообщением
  const existing = await (prisma as any).payoutRequest.findFirst({ where: { logopedId: userId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } })
  if (existing) {
    try {
      const rawLessonsOld = await (prisma as any).lesson.findMany({
        where: { logopedId: userId, settledAt: { not: null, lte: (existing as any).createdAt }, payoutStatus: 'NONE' },
        include: { transactions: { select: { meta: true } } },
        select: undefined as any,
        take: 5000,
      })
      const eligibleOld = (rawLessonsOld as any[]).filter(L => (L.transactions||[]).some((t:any)=> t && (t.meta?.personal !== true)))
      const finalOld = eligibleOld.reduce((sum:number, L:any)=> {
        const share = Number(L.therapistShareAtTime || 0)
        if (share > 0) return sum + Math.round(share)
        const rev = Number(L.revenueAtTime || 0)
        const pct = Number(L.commissionPercentAtTime || 0)
        return sum + (rev>0 && pct>0 ? Math.round(rev*pct/100) : 0)
      }, 0)
      await (prisma as any).payoutRequest.update({ where: { id: (existing as any).id }, data: { finalAmount: finalOld } })
    } catch {}
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000'
    const proto = req.headers.get('x-forwarded-proto') || 'http'
    const dest = `${proto}://${host}/logoped/org-finance?pending=1`
    return NextResponse.redirect(dest, 303)
  }

  // Считаем сумму заявки по урокам: settledAt != null, payoutStatus='NONE', не персональные
  const rawLessons = await (prisma as any).lesson.findMany({
    where: { logopedId: userId, settledAt: { not: null, lt: new Date() }, payoutStatus: 'NONE' },
    include: { transactions: { select: { meta: true, amount: true, kind: true, createdAt: true } }, enrolls: { include: { child: true } } },
    select: undefined as any,
    take: 2000,
  })
  // eligible: все неперсональные (персональные помечены явно meta.personal===true). Отсутствие транзакций не исключает урок.
  const eligible = (rawLessons as any[]).filter(L => !((L.transactions||[]).some((t:any)=> t && (t.meta?.personal === true))))
  // Helpers aligned with org-finance
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
    // 1) Явная номинальная цена из меты любой транзакции
    const anyNominal = (txs||[]).map((t:any)=> Number(t?.meta?.nominalPrice || 0)).find((v:number)=> v>0)
    if (anyNominal && anyNominal > 0) return Math.round(anyNominal)
    // 2) REVENUE
    const revenueTx = (txs||[]).find((t:any)=> t?.kind==='REVENUE' && Number(t?.amount||0) > 0)
    if (revenueTx) return Math.round(Number(revenueTx.amount||0))
    // 3) CASH_THERAPIST случай: если есть CASH_HELD и есть лидерская доля -> восстановим номинал по проценту
    const hasCashHeld = (txs||[]).some((t:any)=> String(t?.kind||'').toUpperCase()==='CASH_HELD')
    const pct = Number(L.commissionPercentAtTime || 0) || Number(currentPercent || 0) || 50
    const leader = Number(L.leaderShareAtTime || 0)
    if (hasCashHeld && leader > 0 && pct>0 && pct<100) {
      const nominal = Math.round(leader * 100 / (100 - pct))
      if (nominal > 0) return nominal
    }
    // 4) Снимок долей
    const sumShares = Number(L.therapistShareAtTime||0) + Number(L.leaderShareAtTime||0)
    if (sumShares > 0) return Math.round(sumShares)
    // 5) Тариф ребёнка
    const rate = Number((L.enrolls||[])[0]?.child?.rateLesson || 0)
    return Math.max(0, Math.round(rate))
  }
  const currentPercent = await getCurrentCommissionPercent(userId!)
  const therapistShare = (L: any): number => {
    const snap = Number(L.therapistShareAtTime || 0)
    if (snap > 0) return Math.round(snap)
    // если revenueAtTime нет, берём fullPrice
    const base = Number(L.revenueAtTime || 0) || fullPrice(L)
    const pct = Number(L.commissionPercentAtTime || 0) || Number(currentPercent || 0) || 50
    return (base>0 && pct>0) ? Math.round(base*pct/100) : 0
  }
  const pendingBalance = eligible.reduce((s:number,L:any)=> s + therapistShare(L), 0)
  let paidToTherapist = 0
  for (const L of eligible) {
    if (whoPaid(L) === 'THERAPIST') paidToTherapist += fullPrice(L)
  }
  const finalAmount = Math.max(0, pendingBalance - paidToTherapist)

  // Требуются снимки в схеме: balanceAtRequest, cashHeldAtRequest — вычислим агрегатно (для совместимости)
  const [balanceAgg, cashAgg] = await Promise.all([
    (prisma as any).transaction.aggregate({ where: { userId, kind: 'THERAPIST_BALANCE' }, _sum: { amount: true } }),
    (prisma as any).transaction.aggregate({ where: { userId, kind: 'CASH_HELD' }, _sum: { amount: true } }),
  ])
  const balanceSnap = Number((balanceAgg as any)._sum?.amount || 0)
  const cashHeldSnap = Number((cashAgg as any)._sum?.amount || 0)

  await (prisma as any).payoutRequest.create({
    data: {
      logopedId: userId,
      balanceAtRequest: balanceSnap,
      cashHeldAtRequest: cashHeldSnap,
      finalAmount,
      status: 'PENDING',
    }
  })

  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000'
  const proto = req.headers.get('x-forwarded-proto') || 'http'
  const dest = `${proto}://${host}/logoped/org-finance?sent=1`
  return NextResponse.redirect(dest, 303)
}
