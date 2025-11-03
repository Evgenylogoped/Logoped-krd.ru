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

  const formData = await req.formData()
  const requestId = String(formData.get('requestId') || '')
  try {
    if (requestId) {
      const pr = await (prisma as any).payoutRequest.findUnique({ where: { id: requestId } })
      if (pr && pr.status === 'PENDING' && (role!=='LOGOPED' || pr.logopedId === userId)) {
        await (prisma as any).payoutRequest.update({ where: { id: pr.id }, data: { status: 'CANCELLED' } })
        try {
          await (prisma as any).pushEventQueue.create({ data: { userId: pr.logopedId, type: 'PAYMENT_STATUS', payload: { title: 'Заявка на выплату отменена', body: 'Вы отменили заявку на выплату. Её можно оформить снова.', url: '/logoped/org-finance' }, scheduledAt: new Date(), attempt: 0 } })
          // notify leaders
          try {
            const me = await (prisma as any).user.findUnique({ where: { id: pr.logopedId }, include: { branch: { include: { company: true } } } })
            const targets: string[] = []
            const managerId = (me as any)?.branch?.managerId as string | undefined
            const ownerId = (me as any)?.branch?.company?.ownerId as string | undefined
            if (managerId && managerId !== pr.logopedId) targets.push(managerId)
            if (ownerId && ownerId !== pr.logopedId && ownerId !== managerId) targets.push(ownerId)
            if (targets.length) {
              const fio = `${(me?.lastName||'').toString().trim()} ${((me?.firstName||'')||'').toString().trim().slice(0,1).toUpperCase()}.${((me?.middleName||'')||'').toString().trim().slice(0,1).toUpperCase() || ''}`.trim()
              const body = `${fio} отменил(а) заявку на выплату`
              await (prisma as any).pushEventQueue.createMany({ data: targets.map(t => ({ userId: t, type: 'PAYMENT_STATUS', payload: { title: 'Отмена заявки на выплату', body, url: 'https://logoped-krd.ru/admin/finance/payouts' }, scheduledAt: new Date(), attempt: 0 })) })
            }
          } catch {}
        } catch {}
      }
    } else {
      // отменяем все PENDING для этого логопеда, если id не передали
      await (prisma as any).payoutRequest.updateMany({ where: { logopedId: userId, status: 'PENDING' }, data: { status: 'CANCELLED' } })
      try {
        await (prisma as any).pushEventQueue.create({ data: { userId, type: 'PAYMENT_STATUS', payload: { title: 'Заявки на выплату отменены', body: 'Все ожидающие заявки отменены.', url: '/logoped/org-finance' }, scheduledAt: new Date(), attempt: 0 } })
        // notify leaders
        try {
          const me = await (prisma as any).user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } })
          const targets: string[] = []
          const managerId = (me as any)?.branch?.managerId as string | undefined
          const ownerId = (me as any)?.branch?.company?.ownerId as string | undefined
          if (managerId && managerId !== userId) targets.push(managerId)
          if (ownerId && ownerId !== userId && ownerId !== managerId) targets.push(ownerId)
          if (targets.length) {
            const fio = `${(me?.lastName||'').toString().trim()} ${((me?.firstName||'')||'').toString().trim().slice(0,1).toUpperCase()}.${((me?.middleName||'')||'').toString().trim().slice(0,1).toUpperCase() || ''}`.trim()
            const body = `${fio} отменил(а) все ожидающие заявки на выплату`
            await (prisma as any).pushEventQueue.createMany({ data: targets.map(t => ({ userId: t, type: 'PAYMENT_STATUS', payload: { title: 'Отмена заявок на выплату', body, url: 'https://logoped-krd.ru/admin/finance/payouts' }, scheduledAt: new Date(), attempt: 0 })) })
          }
        } catch {}
      } catch {}
    }
  } catch {}
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'logoped-krd.ru'
  const origin = `${proto}://${host}`
  return NextResponse.redirect(new URL('/logoped/org-finance?cancelled=1', origin), 303)
}
