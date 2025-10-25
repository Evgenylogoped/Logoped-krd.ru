import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
    return NextResponse.redirect(new URL('/logoped/org-finance?pending=1', req.url), 303)
  }

  const [balanceAgg, cashAgg, payoutAgg] = await Promise.all([
    (prisma as any).transaction.aggregate({ where: { userId, kind: 'THERAPIST_BALANCE' }, _sum: { amount: true } }),
    (prisma as any).transaction.aggregate({ where: { userId, kind: 'CASH_HELD' }, _sum: { amount: true } }),
    (prisma as any).transaction.aggregate({ where: { userId, kind: 'PAYOUT' }, _sum: { amount: true } }),
  ])
  const balance = Number((balanceAgg as any)._sum?.amount || 0)
  const cashHeld = Number((cashAgg as any)._sum?.amount || 0)
  const payouts = Number((payoutAgg as any)._sum?.amount || 0)
  const finalAmount = balance - cashHeld - payouts

  await (prisma as any).payoutRequest.create({
    data: {
      logopedId: userId,
      balanceAtRequest: balance,
      cashHeldAtRequest: cashHeld,
      finalAmount,
      status: 'PENDING',
    }
  })

  return NextResponse.redirect(new URL('/logoped/org-finance?sent=1', req.url), 303)
}
