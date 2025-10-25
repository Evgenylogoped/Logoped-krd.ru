import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

// Helper to parse period window
function getPeriodRange(period: 'week'|'month'|'6m'|'year') {
  const now = new Date()
  let from: Date
  let to: Date | undefined
  if (period === 'week') { const d = new Date(now); d.setDate(d.getDate()-7); from = d }
  else if (period === 'month') { const d = new Date(now); d.setMonth(d.getMonth()-1); from = d }
  else if (period === '6m') { const d = new Date(now); d.setMonth(d.getMonth()-6); from = d }
  else { from = new Date(now.getFullYear(), 0, 1); to = new Date(now.getFullYear()+1, 0, 1) }
  return { from, to }
}

// Types
type Tx = { createdAt?: Date | string; amount?: number | Prisma.Decimal | null; kind?: string | null; meta?: Record<string, unknown> | null }
type Child = { rateLesson?: number | null }
type Lesson = {
  transactions?: Tx[]
  enrolls?: { child?: Child | null }[]
  therapistShareAtTime?: number | null
  leaderShareAtTime?: number | null
  revenueAtTime?: number | null
  commissionPercentAtTime?: number | null
}

// Compute who paid for a lesson from its transactions
function whoPaid(L: Lesson): 'LEADER'|'THERAPIST'|'UNKNOWN' {
  const txs = (L.transactions||[]).slice().sort((a: Tx,b: Tx)=> new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
  const tx = txs[txs.length-1]
  const mRaw = (tx?.meta?.paymentMethod ? String(tx.meta.paymentMethod) : (tx?.meta?.paymentmethod ? String(tx.meta.paymentmethod) : '')).toLowerCase()
  if (mRaw.includes('cash_therapist') || mRaw.includes('therapist')) return 'THERAPIST'
  if (mRaw.includes('subscription') || mRaw.includes('abon') || mRaw.includes('leader') || mRaw.includes('manager') || mRaw.includes('card') || mRaw.includes('bank') || mRaw.includes('noncash') || mRaw.includes('transfer')) return 'LEADER'
  const hasRevenue = (txs||[]).some((t)=> t?.kind==='REVENUE')
  const hasCashHeld = (txs||[]).some((t)=> String(t?.kind||'').toUpperCase()==='CASH_HELD')
  if (hasRevenue) return 'LEADER'
  if (hasCashHeld) return 'THERAPIST'
  return 'UNKNOWN'
}

function fullPrice(L: Lesson): number {
  const txs = (L.transactions||[]).slice().sort((a: Tx,b: Tx)=> new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
  const anyNominal = (txs||[]).map((t)=> Number(t?.meta?.nominalPrice ?? 0)).find((v:number)=> v>0)
  if (anyNominal && anyNominal > 0) return Math.round(anyNominal)
  const revenueTx = (txs||[]).find((t)=> t?.kind==='REVENUE' && Number(t?.amount||0) > 0)
  if (revenueTx) return Math.round(Number(revenueTx.amount||0))
  const sumShares = Number(L.therapistShareAtTime||0) + Number(L.leaderShareAtTime||0)
  if (sumShares > 0) return Math.round(sumShares)
  const rate = Number((L.enrolls||[])[0]?.child?.rateLesson || 0)
  return Math.max(0, Math.round(rate))
}

function therapistShareCalc(L: Lesson): number {
  if (typeof L.therapistShareAtTime === 'number' && !Number.isNaN(L.therapistShareAtTime)) return Math.round(Number(L.therapistShareAtTime))
  const base = Number(L.revenueAtTime || 0) || fullPrice(L)
  const pct = Number(L.commissionPercentAtTime || 0) || 50
  return (base>0 && pct>0) ? Math.round(base*pct/100) : 0
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const userId = String(form.get('userId') || '')
    const period = String(form.get('period') || 'week') as 'week'|'month'|'6m'|'year'
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const { from, to } = getPeriodRange(period)
    // Lessons for the period (eligible)
    const lessonsRaw = await prisma.lesson.findMany({
      where: { logopedId: userId, settledAt: { gte: from, ...(to ? { lt: to } : {}) } },
      include: { transactions: { select: { meta: true, amount: true, kind: true, createdAt: true } }, enrolls: { include: { child: true } } },
      take: 5000,
      orderBy: { settledAt: 'desc' },
    })
    const lessons: Lesson[] = (lessonsRaw as unknown as Lesson[]).filter(L => !((L.transactions||[]).some((t)=> t && (t.meta?.personal === true))))

    const cashTher = (lessons as Lesson[]).reduce((s:number,L)=> s + (whoPaid(L)==='THERAPIST' ? fullPrice(L) : 0), 0)
    const tshare = (lessons as Lesson[]).reduce((s:number,L)=> s + therapistShareCalc(L), 0)

    const net = Math.round(tshare - cashTher)
    // Record a single SETTLEMENT transaction to capture who paid whom to zero the period
    let direction: 'LEADER_TO_THERAPIST' | 'THERAPIST_TO_LEADER' | null = null
    let amount = 0
    if (net > 0) { direction = 'LEADER_TO_THERAPIST'; amount = net }
    else if (net < 0) { direction = 'THERAPIST_TO_LEADER'; amount = Math.abs(net) }
    if (direction && amount>0) {
      await prisma.transaction.create({
        data: {
          userId,
          kind: 'SETTLEMENT',
          amount,
          meta: { direction, periodFrom: (from as Date).toISOString(), periodTo: (to as Date|undefined)?.toISOString?.() || null },
          createdAt: new Date(),
        },
      })
    }

    // Redirect back to payouts with same period
    const url = new URL(req.url)
    url.pathname = '/admin/finance/payouts'
    url.searchParams.set('period', period)
    url.searchParams.set('uid', userId)
    return NextResponse.redirect(url.toString(), { status: 302 })
  } catch (e: unknown) {
    const msg = (e && typeof e === 'object' && 'message' in e) ? String((e as { message?: unknown }).message ?? '') : String(e)
    console.error('settlement confirm error', e)
    return NextResponse.json({ error: 'internal_error', details: msg }, { status: 500 })
  }
}
