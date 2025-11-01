"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function confirmPayout(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const adminId = (session?.user as any)?.id
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(role)) throw new Error('Forbidden')

  const payoutId = String(formData.get('payoutId') || '')
  const amountStr = String(formData.get('amount') || '')
  const customAmount = amountStr ? Number(amountStr) : undefined

  const req = await (prisma as any).payoutRequest.findUnique({ where: { id: payoutId } })
  if (!req) throw new Error('Payout request not found')

  // Собираем уроки логопеда, которые ещё не включены в выплаты и были посчитаны до момента запроса
  const lessons = await (prisma as any).lesson.findMany({
    where: {
      logopedId: req.logopedId,
      payoutStatus: 'NONE',
      settledAt: { lte: req.createdAt },
    },
    select: { id: true }
  })

  const finalAmount = customAmount != null ? customAmount : Number(req.finalAmount || 0)

  await (prisma as any).$transaction([
    // Линки уроков в выплату
    ...(lessons.map((l: any) => (prisma as any).payoutLessonLink.create({ data: { payoutId, lessonId: l.id } }))),
    // Пометить уроки оплаченными
    (prisma as any).lesson.updateMany({ where: { id: { in: lessons.map((l: any) => l.id) } }, data: { payoutStatus: 'PAID' } }),
    // Финансовая транзакция PAYOUT
    (prisma as any).transaction.create({
      data: {
        userId: req.logopedId,
        kind: 'PAYOUT',
        amount: finalAmount,
        meta: { source: 'payout', payoutId },
      }
    }),
    // Обновить статус запроса
    (prisma as any).payoutRequest.update({
      where: { id: payoutId },
      data: { status: 'PAID', confirmedAt: new Date(), confirmedById: adminId }
    })
  ])
  // Push notifications to both sides
  try {
    const logopedId = String(req.logopedId)
    const admin = await (prisma as any).user.findUnique({ where: { id: adminId }, select: { firstName: true, lastName: true, middleName: true } })
    const fio = `${(admin?.lastName||'').trim()} ${((admin?.firstName||'')||'').toString().trim().slice(0,1).toUpperCase()}.${((admin?.middleName||'')||'').toString().trim().slice(0,1).toUpperCase() || ''}`.trim()
    const amountStr = `${Number(finalAmount||0).toLocaleString('ru-RU')} ₽`
    // To logoped
    try { await (prisma as any).pushEventQueue.create({ data: { userId: logopedId, type: 'PAYMENT_STATUS', payload: { title: 'Выплата подтверждена', body: `Вас рассчитал руководитель ${fio} по вашему запросу`, url: '/logoped/finance' }, scheduledAt: new Date(), attempt: 0 } }) } catch {}
    // To leader (self)
    try { await (prisma as any).pushEventQueue.create({ data: { userId: adminId, type: 'PAYMENT_STATUS', payload: { title: 'Выплата выполнена', body: `Вы рассчитаны с логопедом на сумму ${amountStr}`, url: 'https://logoped-krd.ru/admin/finance/payouts' }, scheduledAt: new Date(), attempt: 0 } }) } catch {}
  } catch {}

  revalidatePath('/admin/finance/payouts')
}
