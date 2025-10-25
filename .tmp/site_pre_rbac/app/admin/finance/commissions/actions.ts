"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getTherapistSummary } from '@/services/finance'

export async function setCommissionRate(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session) throw new Error('Forbidden')
  let allowed = ['ADMIN','SUPER_ADMIN'].includes(role)
  if (!allowed && role === 'LOGOPED') {
    const adminId = (session?.user as any)?.id
    const meGuard = await (prisma as any).user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
    const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: adminId }, select: { id: true } })
    const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: adminId }, select: { id: true } })
    const isOwnerGuard = Boolean(meGuard?.branch?.company?.ownerId === adminId) || Boolean(ownedCompany)
    const isBranchManagerGuard = Boolean(meGuard?.branch?.managerId === adminId) || Boolean(managesAny)
    allowed = isOwnerGuard || isBranchManagerGuard
  }
  if (!allowed) throw new Error('Forbidden')

  const userId = String(formData.get('userId') || '')
  const percent = Number(formData.get('percent') || '0')
  const from = new Date(String(formData.get('validFrom') || new Date().toISOString()))

  if (!userId || percent <= 0 || percent > 100) throw new Error('Bad input')

  // Нельзя менять проценты при наличии взаиморасчётов (учитываем payouts) или если есть незакрытые занятия
  try {
    const { balance, cashHeld, payouts } = await (async ()=>{
      const [b, c, p] = await Promise.all([
        (prisma as any).transaction.aggregate({ where: { userId, kind: 'THERAPIST_BALANCE' }, _sum: { amount: true } }),
        (prisma as any).transaction.aggregate({ where: { userId, kind: 'CASH_HELD' }, _sum: { amount: true } }),
        (prisma as any).transaction.aggregate({ where: { userId, kind: 'PAYOUT' }, _sum: { amount: true } }),
      ])
      return { balance: Number(b._sum?.amount||0), cashHeld: Number(c._sum?.amount||0), payouts: Number(p._sum?.amount||0) }
    })()
    const net = balance - cashHeld - payouts
    // проверим наличие незакрытых (eligible) занятий
    const eligibleCount = await (prisma as any).lesson.count({ where: { logopedId: userId, settledAt: { not: null, lt: new Date() }, payoutStatus: 'NONE' } })
    const eps = 0.5
    const hasDebt = Math.abs(net) > eps || eligibleCount > 0
    if (hasDebt) throw new Error('Смена невозможна до полного взаиморасчета с логопедом')
  } catch (e: any) {
    if (e && e.message) throw e
    throw new Error('Смена невозможна до полного взаиморасчета с логопедом')
  }

  // закрыть текущую запись если она открыта
  const openRate = await (prisma as any).commissionRate.findFirst({ where: { userId, validTo: null }, orderBy: { validFrom: 'desc' } })
  if (openRate) {
    await (prisma as any).commissionRate.update({ where: { id: openRate.id }, data: { validTo: from } })
  }

  await (prisma as any).commissionRate.create({ data: { userId, percent, validFrom: from } })
  revalidatePath('/admin/finance/commissions')
}
