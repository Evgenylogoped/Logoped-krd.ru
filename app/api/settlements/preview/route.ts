import { NextRequest, NextResponse } from 'next/server'
import { computeSettlement, getPeriodRange, whoPaid, fullPrice, therapistShareCalc } from '@/lib/settlement'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const userId = String(url.searchParams.get('userId') || '')
    const period = String(url.searchParams.get('period') || 'week') as any
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const { from, to, lessons, cashTher, tshare, net } = await computeSettlement(userId, period)

    const details = (lessons as any[]).map((L:any) => ({
      id: L.id,
      when: new Date(L.settledAt || L.createdAt).toISOString(),
      paidBy: whoPaid(L),
      price: fullPrice(L),
      share: therapistShareCalc(L),
    }))

    const payouts = await (prisma as any).transaction.findMany({
      where: { userId, kind: 'PAYOUT', createdAt: { gte: from, ...(to?{ lt: to }: {}) } },
      select: { id: true, amount: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    })

    const settlements = await (prisma as any).transaction.findMany({
      where: { userId, kind: 'SETTLEMENT', createdAt: { gte: from, ...(to?{ lt: to }: {}) } },
      select: { id: true, amount: true, createdAt: true, meta: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    })

    return NextResponse.json({
      period: { from, to },
      totals: { tshare, cashTher, net },
      payouts,
      settlements,
      lessons: details,
    })
  } catch (e:any) {
    return NextResponse.json({ error: 'internal_error', details: e?.message || String(e) }, { status: 500 })
  }
}
