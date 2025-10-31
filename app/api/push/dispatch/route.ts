import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function inQuietHoursMsk(nowUtcMs: number, fromHour: number, toHour: number) {
  const msk = new Date(nowUtcMs + 3 * 60 * 60 * 1000)
  const h = msk.getUTCHours()
  if (fromHour === toHour) return false
  if (fromHour < toHour) return h >= fromHour && h < toHour
  return h >= fromHour || h < toHour
}

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Allow any logged user to trigger for now (can be cron/authed later)

  const pub = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim()
  const priv = (process.env.VAPID_PRIVATE_KEY || '').trim()
  if (!pub || !priv) return NextResponse.json({ error: 'VAPID_NOT_CONFIGURED' }, { status: 500 })
  webpush.setVapidDetails('mailto:admin@logoped-krd.ru', pub, priv)

  const now = new Date()
  const batch = await prisma.pushEventQueue.findMany({
    where: {
      OR: [
        { nextRetryAt: null },
        { nextRetryAt: { lte: now } },
      ],
      scheduledAt: { lte: now },
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })

  let sent = 0
  let errors = 0

  for (const ev of batch) {
    try {
      const prefs = await prisma.userNotificationPreference.findUnique({ where: { userId: ev.userId } })
      const allowByType = (() => {
        if (!prefs) return true
        switch (ev.type) {
          case 'MSG_NEW': return prefs.msgNew
          case 'BOOKING_UPDATE': return prefs.bookingUpdate
          case 'PAYMENT_STATUS': return prefs.paymentStatus
          case 'ADMIN_BROADCAST': return prefs.adminBroadcast
          default: return true
        }
      })()
      if (!allowByType) {
        await prisma.pushEventQueue.delete({ where: { id: ev.id } })
        continue
      }
      if (prefs?.quietHoursEnabled) {
        const from = prefs.quietFromMsk ?? 22
        const to = prefs.quietToMsk ?? 8
        if (inQuietHoursMsk(Date.now(), from, to)) {
          // Сдвигаем на конец тихого окна
          const mskNow = new Date(Date.now() + 3 * 3600 * 1000)
          const next = new Date(mskNow)
          next.setUTCHours(to, 0, 0, 0)
          let nextUtc = new Date(next.getTime() - 3 * 3600 * 1000)
          if (inQuietHoursMsk(nextUtc.getTime(), from, to) === false && nextUtc < now) {
            nextUtc = new Date(now.getTime() + 60 * 60 * 1000)
          }
          await prisma.pushEventQueue.update({ where: { id: ev.id }, data: { nextRetryAt: nextUtc } })
          continue
        }
      }

      const sub = await prisma.webPushSubscription.findFirst({ where: { userId: ev.userId }, orderBy: { createdAt: 'desc' } })
      if (!sub) {
        await prisma.pushDeliveryLog.create({ data: { userId: ev.userId, type: ev.type as any, status: 'error', error: 'NO_SUBSCRIPTION' } })
        await prisma.pushEventQueue.delete({ where: { id: ev.id } })
        continue
      }

      const payload = JSON.stringify({
        icon: '/icons/icon-512.png',
        badge: '/icons/badge-mono.svg',
        ...(ev.payload as any),
      })
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } as any, payload)
      await prisma.pushDeliveryLog.create({ data: { userId: ev.userId, type: ev.type as any, status: 'success' } })
      await prisma.pushEventQueue.delete({ where: { id: ev.id } })
      sent++
    } catch (e: any) {
      errors++
      const msg = e?.message || String(e)
      // 410 Gone -> удалить подписку
      if (msg.includes('410') || msg.includes('unsubscribed') || msg.includes('expired')) {
        try {
          const sub = await prisma.webPushSubscription.findFirst({ where: { userId: ev.userId } })
          if (sub) await prisma.webPushSubscription.delete({ where: { endpoint: sub.endpoint } })
        } catch {}
        await prisma.pushDeliveryLog.create({ data: { userId: ev.userId, type: ev.type as any, status: 'error', error: msg.slice(0, 500) } })
        await prisma.pushEventQueue.delete({ where: { id: ev.id } })
        continue
      }
      const nextDelayMin = [1, 5, 15, 60][Math.min(ev.attempt, 3)]
      const retryAt = new Date(Date.now() + nextDelayMin * 60 * 1000)
      await prisma.pushEventQueue.update({ where: { id: ev.id }, data: { attempt: ev.attempt + 1, nextRetryAt: retryAt } })
    }
  }

  return NextResponse.json({ ok: true, processed: batch.length, sent, errors })
}
