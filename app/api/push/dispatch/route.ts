import { NextRequest, NextResponse } from 'next/server'
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

export async function POST(req: NextRequest) {
  const cronKey = (req.headers.get('x-cron-key') || '').trim()
  const expected = (process.env.CRON_PUSH_KEY || '').trim()
  const host = (req.headers.get('host') || '').toLowerCase()
  const isLocal = host.startsWith('127.0.0.1') || host.startsWith('localhost')
  if (!isLocal) {
    if (!expected && !cronKey) {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    } else if (!expected || cronKey !== expected) {
      const session = await getServerSession(authOptions)
      if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

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
          case 'MSG_NEW': return prefs.msgNew !== false
          case 'BOOKING_UPDATE': return prefs.bookingUpdate !== false
          case 'PAYMENT_STATUS': return prefs.paymentStatus !== false
          case 'ADMIN_BROADCAST': return prefs.adminBroadcast !== false
          default: return true
        }
      })()
      if (!allowByType) {
        await prisma.pushEventQueue.delete({ where: { id: ev.id } })
        continue
      }
      // Defer during quiet hours only for non-chat types; chat (MSG_NEW) should arrive immediately
      if (ev.type !== 'MSG_NEW' && prefs?.quietHoursEnabled === true) {
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

      const subs = await prisma.webPushSubscription.findMany({ where: { userId: ev.userId }, orderBy: { createdAt: 'desc' } })
      if (!subs.length) {
        await prisma.pushDeliveryLog.create({ data: { userId: ev.userId, type: ev.type as any, status: 'error', error: 'NO_SUBSCRIPTION' } })
        await prisma.pushEventQueue.delete({ where: { id: ev.id } })
        continue
      }

      const payload = JSON.stringify({
        icon: '/icons/icon-512.png',
        badge: '/icons/badge-mono.svg',
        ...(ev.payload as any),
      })
      console.log('DEBUG: push payload:', payload)

      let delivered = 0
      for (const s of subs) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as any, payload)
          await prisma.pushDeliveryLog.create({ data: { userId: ev.userId, type: ev.type as any, status: 'success' } })
          delivered++
        } catch (e: any) {
          const sc = (e && typeof e === 'object' && 'statusCode' in e) ? Number((e as any).statusCode) : undefined
          const msg = (e?.message || String(e)) + (sc ? ` [${sc}]` : '')
          if (sc === 404 || sc === 410 || msg.includes('410') || msg.includes('unsubscribed') || msg.includes('expired')) {
            try { await prisma.webPushSubscription.delete({ where: { endpoint: s.endpoint } }) } catch {}
            await prisma.pushDeliveryLog.create({ data: { userId: ev.userId, type: ev.type as any, status: 'error', error: sc === 404 ? '404_NOT_FOUND' : '410_GONE' } })
          } else {
            await prisma.pushDeliveryLog.create({ data: { userId: ev.userId, type: ev.type as any, status: 'error', error: msg.slice(0, 500) } })
          }
        }
      }

      if (delivered > 0) {
        await prisma.pushEventQueue.delete({ where: { id: ev.id } })
        sent++
        continue
      }
      // If reached here, no delivery succeeded; decide retry vs delete.
      const stillHasSubs = await prisma.webPushSubscription.count({ where: { userId: ev.userId } })
      if (!stillHasSubs) {
        await prisma.pushEventQueue.delete({ where: { id: ev.id } })
      } else {
        const nextDelayMin = [1, 5, 15, 60][Math.min(ev.attempt, 3)]
        const retryAt = new Date(Date.now() + nextDelayMin * 60 * 1000)
        await prisma.pushEventQueue.update({ where: { id: ev.id }, data: { attempt: ev.attempt + 1, nextRetryAt: retryAt } })
      }
    } catch (e: any) {
      errors++
      const sc = (e && typeof e === 'object' && 'statusCode' in e) ? Number((e as any).statusCode) : undefined
      const msg = (e?.message || String(e)) + (sc ? ` [${sc}]` : '')
      // 410 Gone -> удалить подписку
      if (sc === 404 || sc === 410 || msg.includes('410') || msg.includes('unsubscribed') || msg.includes('expired')) {
        try {
          const sub = await prisma.webPushSubscription.findFirst({ where: { userId: ev.userId } })
          if (sub) await prisma.webPushSubscription.delete({ where: { endpoint: sub.endpoint } })
        } catch {}
        await prisma.pushDeliveryLog.create({ data: { userId: ev.userId, type: ev.type as any, status: 'error', error: (sc === 404 ? '404_NOT_FOUND' : '410_GONE') } })
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
