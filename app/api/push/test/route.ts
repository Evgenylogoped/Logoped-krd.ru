import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import webpush from 'web-push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const pub = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '').trim()
  const priv = (process.env.VAPID_PRIVATE_KEY || '').trim()
  if (!pub || !priv) return NextResponse.json({ error: 'VAPID_NOT_CONFIGURED' }, { status: 500 })

  webpush.setVapidDetails('mailto:admin@logoped-krd.ru', pub, priv)

  const sub = await prisma.webPushSubscription.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })
  if (!sub) return NextResponse.json({ error: 'NO_SUBSCRIPTION' }, { status: 404 })

  try {
    const payload = JSON.stringify({
      title: 'Logoped-krd.ru',
      body: 'Тестовое уведомление',
      icon: '/icons/push-512.png',
      badge: '/icons/badge-96.png',
      data: { url: '/' },
    })
    await webpush.sendNotification({
      endpoint: sub.endpoint,
      keys: { p256dh: sub.p256dh, auth: sub.auth },
    } as any, payload)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const details = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'PUSH_SEND_FAILED', details }, { status: 500 })
  }
}
