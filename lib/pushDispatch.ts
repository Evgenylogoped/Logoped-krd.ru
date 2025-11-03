import { prisma } from '@/lib/prisma'
import webpush from 'web-push'

function inQuietHoursMsk(nowUtcMs: number, fromHour: number, toHour: number) {
  const msk = new Date(nowUtcMs + 3 * 60 * 60 * 1000)
  const h = msk.getUTCHours()
  if (fromHour === toHour) return false
  if (fromHour < toHour) return h >= fromHour && h < toHour
  return h >= fromHour || h < toHour
}

export async function processPushQueue(limit = 50) {
  const pub = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim()
  const priv = (process.env.VAPID_PRIVATE_KEY || '').trim()
  if (!pub || !priv) return { processed: 0, sent: 0, errors: 1, error: 'VAPID_NOT_CONFIGURED' }
  webpush.setVapidDetails('mailto:admin@logoped-krd.ru', pub, priv)

  const now = new Date()
  const batch = await prisma.pushEventQueue.findMany({
    where: { OR: [ { nextRetryAt: null }, { nextRetryAt: { lte: now } } ], scheduledAt: { lte: now } },
    orderBy: { createdAt: 'asc' }, take: limit,
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
      if (!allowByType) { await prisma.pushEventQueue.delete({ where: { id: ev.id } }); continue }
      if (prefs?.quietHoursEnabled) {
        const from = prefs.quietFromMsk ?? 22
        const to = prefs.quietToMsk ?? 8
        if (inQuietHoursMsk(Date.now(), from, to)) {
          const mskNow = new Date(Date.now() + 3 * 3600 * 1000)
          const next = new Date(mskNow); next.setUTCHours(to, 0, 0, 0)
          let nextUtc = new Date(next.getTime() - 3 * 3600 * 1000)
          if (inQuietHoursMsk(nextUtc.getTime(), from, to) === false && nextUtc < now) {
            nextUtc = new Date(now.getTime() + 60 * 60 * 1000)
          }
          await prisma.pushEventQueue.update({ where: { id: ev.id }, data: { nextRetryAt: nextUtc } })
          continue
        }
      }

      const subs = await prisma.webPushSubscription.findMany({ where: { userId: ev.userId }, orderBy: { createdAt: 'desc' } })
      if (!subs.length) { await prisma.pushDeliveryLog.create({ data: { userId: ev.userId, type: ev.type as any, status: 'error', error: 'NO_SUBSCRIPTION' } }); await prisma.pushEventQueue.delete({ where: { id: ev.id } }); continue }

      const p = (ev.payload as any) || {}
      const body = (p.title ? (String(p.title)+': ') : '') + (p.body ? String(p.body) : '')
      const payload = JSON.stringify({ icon: '/icons/icon-512.png', badge: '/icons/badge-mono.svg', title: 'My Logoped', body, url: p.url || '/' })

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

      if (delivered > 0) { await prisma.pushEventQueue.delete({ where: { id: ev.id } }); sent++; continue }
      const stillHasSubs = await prisma.webPushSubscription.count({ where: { userId: ev.userId } })
      if (!stillHasSubs) { await prisma.pushEventQueue.delete({ where: { id: ev.id } }) }
      else {
        const nextDelayMin = [1,5,15,60][Math.min(ev.attempt,3)]
        const retryAt = new Date(Date.now() + nextDelayMin * 60 * 1000)
        await prisma.pushEventQueue.update({ where: { id: ev.id }, data: { attempt: ev.attempt + 1, nextRetryAt: retryAt } })
      }
    } catch (e) {
      errors++
      const nextDelayMin = [1,5,15,60][0]
      const retryAt = new Date(Date.now() + nextDelayMin * 60 * 1000)
      try { await prisma.pushEventQueue.update({ where: { id: (ev as any).id }, data: { attempt: (ev as any).attempt + 1, nextRetryAt: retryAt } }) } catch {}
    }
  }

  return { processed: batch.length, sent, errors }
}
