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

  // Считаем "к выплате" через уроки, уже проведённые (settledAt) и ещё не вошедшие в выплаты
  const lessons = await (prisma as any).lesson.findMany({
    where: { logopedId: userId, payoutStatus: 'NONE', settledAt: { not: null } },
    select: { therapistShareAtTime: true, revenueAtTime: true, commissionPercentAtTime: true },
    take: 2000,
  })
  const finalAmount = (lessons as any[]).reduce((sum, L) => {
    const share = (L as any).therapistShareAtTime
    if (typeof share === 'number' && !Number.isNaN(share)) return sum + Number(share)
    const rev = Number((L as any).revenueAtTime || 0)
    const pct = Number((L as any).commissionPercentAtTime || 0)
    if (rev > 0 && pct > 0) return sum + Math.round(rev * pct / 100)
    return sum
  }, 0)

  const req = await (prisma as any).payoutRequest.create({
    data: {
      logopedId: userId,
      // Поля snapshot оставим для бэк-совместимости, но итоговая сумма опирается на уроки
      balanceAtRequest: undefined,
      cashHeldAtRequest: undefined,
      finalAmount,
      status: 'PENDING',
    }
  })
  // Pushes: requester and leaders
  try {
    const me = await (prisma as any).user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } })
    const amountStr = `${Number(finalAmount||0).toLocaleString('ru-RU')} ₽`
    const dateStr = new Date(req.createdAt).toLocaleDateString('ru-RU')
    // To requester
    try { await (prisma as any).pushEventQueue.create({ data: { userId, type: 'PAYMENT_STATUS', payload: { title: 'Вы запросили выплату', body: `руководителю на сумму ${amountStr} от ${dateStr}`, url: '/logoped/finance' }, scheduledAt: new Date(), attempt: 0 } }) } catch {}
    // To leaders (branch manager and company owner if exist and not me)
    const targets: string[] = []
    const managerId = me?.branch?.managerId as string | undefined
    const ownerId = me?.branch?.company?.ownerId as string | undefined
    if (managerId && managerId !== userId) targets.push(managerId)
    if (ownerId && ownerId !== userId && ownerId !== managerId) targets.push(ownerId)
    if (targets.length) {
      const fio = `${me?.lastName||''} ${((me?.firstName||'').toString().trim()[0]||'').toUpperCase()}.` + `${((me?.middleName||'').toString().trim()[0]||'') ? ((me?.middleName||'').toString().trim()[0].toUpperCase()+'.') : ''}`
      const body = `${fio.trim()} запросил(а) выплату на сумму ${amountStr} от ${dateStr}`
      await (prisma as any).pushEventQueue.createMany({ data: targets.map(t => ({ userId: t, type: 'PAYMENT_STATUS', payload: { title: 'Запрос выплаты от логопеда', body, url: 'https://logoped-krd.ru/admin/finance/payouts' }, scheduledAt: new Date(), attempt: 0 })) })
    }
  } catch {}
  revalidatePath('/logoped/finance')
  redirect('/logoped/finance?sent=1')
}
