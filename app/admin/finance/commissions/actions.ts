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

  // Нельзя менять проценты при наличии взаиморасчётов (учитываем payouts) или если есть незакрытые орг-уроки
  try {
    // Считаем нетто только по орг-транзакциям (meta.personal !== true)
    const txRaw = await (prisma as any).transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: { kind: true, amount: true, meta: true },
    })
    const txOrg = (txRaw as any[]).filter(t => !(t?.meta?.personal === true))
    const sumKind = (k: string) => txOrg.filter(t=> String(t.kind||'').toUpperCase()===k).reduce((s,t)=> s + Number(t.amount||0), 0)
    const balance = sumKind('THERAPIST_BALANCE')
    const cashHeld = sumKind('CASH_HELD')
    const payouts = sumKind('PAYOUT')
    const net = balance - cashHeld - payouts

    // Незакрытые уроки только орг (исключаем персональные)
    const lessons = await (prisma as any).lesson.findMany({
      where: { logopedId: userId, settledAt: { not: null, lt: new Date() }, payoutStatus: 'NONE' },
      include: { transactions: { select: { meta: true } } },
      take: 500,
    })
    const eligibleCount = (lessons as any[]).filter(L => (L.transactions||[]).some((t:any)=> t && (t.meta?.personal !== true))).length

    const eps = 1 // округление до рубля, избегаем копеечных хвостов
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
