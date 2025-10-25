import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ pending: 0, lastConfirmedAt: null })
  const userId = (session.user as any)?.id as string
  const role = (session.user as any)?.role as string
  if (role !== 'LOGOPED') return NextResponse.json({ pending: 0, lastConfirmedAt: null })

  const pending = await (prisma as any).payoutRequest.count({ where: { logopedId: userId, status: 'PENDING' } })
  const lastPaid = await (prisma as any).transaction.findFirst({ where: { userId, kind: 'PAYOUT', amount: { not: 0 } }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } })
  return NextResponse.json({ pending, lastConfirmedAt: lastPaid?.createdAt || null })
}
