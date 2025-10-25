import { prisma } from '@/lib/prisma'

export type Period = 'week'|'month'|'6m'|'year'

export function getPeriodRange(period: Period) {
  const now = new Date()
  let from: Date
  let to: Date | undefined
  if (period === 'week') { const d = new Date(now); d.setDate(d.getDate()-7); from = d }
  else if (period === 'month') { const d = new Date(now); d.setMonth(d.getMonth()-1); from = d }
  else if (period === '6m') { const d = new Date(now); d.setMonth(d.getMonth()-6); from = d }
  else { from = new Date(now.getFullYear(), 0, 1); to = new Date(now.getFullYear()+1, 0, 1) }
  return { from, to }
}

export function whoPaid(L: any): 'LEADER'|'THERAPIST'|'UNKNOWN' {
  const txs = (L.transactions||[]).slice().sort((a:any,b:any)=> new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
  const tx = txs[txs.length-1]
  const mRaw = (tx?.meta?.paymentMethod || tx?.meta?.paymentmethod || '').toString().toLowerCase()
  if (mRaw.includes('cash_therapist') || mRaw.includes('therapist')) return 'THERAPIST'
  if (mRaw.includes('subscription') || mRaw.includes('abon') || mRaw.includes('leader') || mRaw.includes('manager') || mRaw.includes('card') || mRaw.includes('bank') || mRaw.includes('noncash') || mRaw.includes('transfer')) return 'LEADER'
  const hasRevenue = (txs||[]).some((t:any)=> t?.kind==='REVENUE')
  const hasCashHeld = (txs||[]).some((t:any)=> String(t?.kind||'').toUpperCase()==='CASH_HELD')
  if (hasRevenue) return 'LEADER'
  if (hasCashHeld) return 'THERAPIST'
  return 'UNKNOWN'
}

export function fullPrice(L: any): number {
  const txs = (L.transactions||[]).slice().sort((a:any,b:any)=> new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
  const anyNominal = (txs||[]).map((t:any)=> Number(t?.meta?.nominalPrice || 0)).find((v:number)=> v>0)
  if (anyNominal && anyNominal > 0) return Math.round(anyNominal)
  const revenueTx = (txs||[]).find((t:any)=> t?.kind==='REVENUE' && Number(t?.amount||0) > 0)
  if (revenueTx) return Math.round(Number(revenueTx.amount||0))
  const sumShares = Number(L.therapistShareAtTime||0) + Number(L.leaderShareAtTime||0)
  if (sumShares > 0) return Math.round(sumShares)
  const rate = Number((L.enrolls||[])[0]?.child?.rateLesson || 0)
  return Math.max(0, Math.round(rate))
}

export function therapistShareCalc(L: any, defaultPct = 50): number {
  if (typeof L.therapistShareAtTime === 'number' && !Number.isNaN(L.therapistShareAtTime)) return Math.round(Number(L.therapistShareAtTime))
  const base = Number(L.revenueAtTime || 0) || fullPrice(L)
  const pct = Number(L.commissionPercentAtTime || 0) || defaultPct
  return (base>0 && pct>0) ? Math.round(base*pct/100) : 0
}

export async function computeSettlement(userId: string, period: Period) {
  const { from, to } = getPeriodRange(period)
  const lessons = await (prisma as any).lesson.findMany({
    where: { logopedId: userId, settledAt: { gte: from, ...(to ? { lt: to } : {}) } },
    include: { transactions: { select: { meta: true, amount: true, kind: true, createdAt: true } }, enrolls: { include: { child: true } } },
    orderBy: { settledAt: 'desc' },
    take: 5000,
  })
  const eligible = (lessons as any[]).filter(L => !((L.transactions||[]).some((t:any)=> t && (t.meta?.personal === true))))
  const cashTher = (eligible as any[]).reduce((s:number,L:any)=> s + (whoPaid(L)==='THERAPIST' ? fullPrice(L) : 0), 0)
  const tshare = (eligible as any[]).reduce((s:number,L:any)=> s + therapistShareCalc(L), 0)
  const net = Math.round(tshare - cashTher)
  return { from, to, lessons: eligible, cashTher: Math.round(cashTher), tshare: Math.round(tshare), net }
}

export async function computeSettlementWindow(userId: string, from: Date, to: Date) {
  const lessons = await (prisma as any).lesson.findMany({
    where: { logopedId: userId, settledAt: { gte: from, lt: to } },
    include: { transactions: { select: { meta: true, amount: true, kind: true, createdAt: true } }, enrolls: { include: { child: true } } },
    orderBy: { settledAt: 'desc' },
    take: 5000,
  })
  const eligible = (lessons as any[]).filter(L => !((L.transactions||[]).some((t:any)=> t && (t.meta?.personal === true))))
  const cashTher = (eligible as any[]).reduce((s:number,L:any)=> s + (whoPaid(L)==='THERAPIST' ? fullPrice(L) : 0), 0)
  const tshare = (eligible as any[]).reduce((s:number,L:any)=> s + therapistShareCalc(L), 0)
  const net = Math.round(tshare - cashTher)
  return { lessons: eligible, cashTher: Math.round(cashTher), tshare: Math.round(tshare), net }
}
