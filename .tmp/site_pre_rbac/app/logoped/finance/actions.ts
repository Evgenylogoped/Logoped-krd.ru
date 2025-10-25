"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPayoutRequest(): Promise<void> {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  const role = (session?.user as any)?.role
  if (!session || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role)) throw new Error('Forbidden')

  // Если уже есть незакрытая заявка — не создаём новую, чтобы не "отменять" старую логически
  const existing = await (prisma as any).payoutRequest.findFirst({ where: { logopedId: userId, status: 'PENDING' }, orderBy: { createdAt: 'desc' } })
  if (existing) {
    redirect('/logoped/finance?pending=1')
  }

  const [balanceAgg, cashAgg, payoutAgg] = await Promise.all([
    (prisma as any).transaction.aggregate({ where: { userId, kind: 'THERAPIST_BALANCE' }, _sum: { amount: true } }),
    (prisma as any).transaction.aggregate({ where: { userId, kind: 'CASH_HELD' }, _sum: { amount: true } }),
    (prisma as any).transaction.aggregate({ where: { userId, kind: 'PAYOUT' }, _sum: { amount: true } }),
  ])
  const balance = Number(balanceAgg._sum?.amount || 0)
  const cashHeld = Number(cashAgg._sum?.amount || 0)
  const payouts = Number(payoutAgg._sum?.amount || 0)
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
  revalidatePath('/logoped/finance')
  redirect('/logoped/finance?sent=1')
}
