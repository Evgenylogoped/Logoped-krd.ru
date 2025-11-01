import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { pluralZanyatie, formatDateTimeMsk, formatTimeMsk } from '@/lib/pushText'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function nowMsk() {
  const now = new Date()
  return new Date(now.getTime() + 3*60*60*1000)
}

function startOfDayMsk(d: Date) {
  const s = new Date(d)
  s.setUTCHours(0,0,0,0)
  return s
}
function endOfDayMsk(d: Date) {
  const e = new Date(d)
  e.setUTCHours(23,59,59,999)
  return e
}

export async function POST(req: NextRequest) {
  // Cron-key auth (same policy as dispatch); allow local host bypass
  const cronKey = (req.headers.get('x-cron-key') || '').trim()
  const expected = (process.env.CRON_PUSH_KEY || '').trim()
  const host = (req.headers.get('host') || '').toLowerCase()
  const isLocal = host.startsWith('127.0.0.1') || host.startsWith('localhost')
  if (!isLocal && (!expected || cronKey !== expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const msk = nowMsk()
  const hour = msk.getUTCHours()
  const minute = msk.getUTCMinutes()
  const dow = msk.getUTCDay() // 0=Sun

  let enqueued = 0

  // 1) Weekly reminder: Sunday 08:00 MSK (run within first 5 minutes)
  if (dow === 0 && hour === 8 && minute < 5) {
    const users = await prisma.user.findMany({ where: { role: { in: ['LOGOPED','ADMIN','SUPER_ADMIN'] } }, select: { id: true } })
    const data = users.map(u => ({ userId: u.id, type: 'BOOKING_UPDATE' as any, payload: { title: 'План на неделю', body: 'Напоминаю о необходимости уточнения плана на следующую неделю', url: '/logoped/schedule' }, scheduledAt: new Date(), attempt: 0 }))
    if (data.length) { try { const r = await (prisma as any).pushEventQueue.createMany({ data, skipDuplicates: true }); enqueued += Number(r?.count||0) } catch {} }
  }

  // 2) Daily plan for logopeds/leaders: 07:00 MSK (first 5 minutes)
  if (hour === 7 && minute < 5) {
    const dayStart = startOfDayMsk(msk)
    const dayEnd = endOfDayMsk(msk)
    const lessons = await prisma.lesson.findMany({
      where: { startsAt: { gte: new Date(dayStart.getTime() - 3*3600*1000), lte: new Date(dayEnd.getTime() - 3*3600*1000) } },
      select: { id: true, logopedId: true, enrolls: { select: { id: true } } }
    })
    const counts = new Map<string, number>()
    for (const l of lessons) {
      if ((l.enrolls?.length || 0) > 0 && l.logopedId) {
        counts.set(l.logopedId, (counts.get(l.logopedId) || 0) + 1)
      }
    }
    const data: any[] = []
    for (const [uid, cnt] of counts) {
      const body = `Посмотрите план на сегодня, у вас ${cnt} ${pluralZanyatie(cnt)}`
      data.push({ userId: uid, type: 'BOOKING_UPDATE', payload: { title: 'План на сегодня', body, url: '/logoped/schedule' }, scheduledAt: new Date(), attempt: 0 })
    }
    if (data.length) { try { const r = await (prisma as any).pushEventQueue.createMany({ data, skipDuplicates: true }); enqueued += Number(r?.count||0) } catch {} }
  }

  // 3) Parent day-before 20:00 MSK (first 5 minutes) for lessons tomorrow
  if (hour === 20 && minute < 5) {
    const tomorrow = new Date(msk)
    tomorrow.setUTCDate(msk.getUTCDate() + 1)
    const tStart = startOfDayMsk(tomorrow)
    const tEnd = endOfDayMsk(tomorrow)
    const lessons = await prisma.lesson.findMany({
      where: { startsAt: { gte: new Date(tStart.getTime() - 3*3600*1000), lte: new Date(tEnd.getTime() - 3*3600*1000) } },
      select: { id: true, startsAt: true, logoped: { select: { firstName: true, lastName: true, middleName: true } }, enrolls: { select: { child: { select: { id: true, firstName: true, lastName: true, parent: { select: { userId: true } } } } } } }
    })
    const data: any[] = []
    for (const l of lessons) {
      const child = l.enrolls?.[0]?.child as any
      const parentUserId = child?.parent?.userId as string | undefined
      if (!parentUserId) continue
      const fioL = `${(l as any).logoped?.lastName||''} ${(((l as any).logoped?.firstName||'')||'').toString().trim().slice(0,1).toUpperCase()}.${(((l as any).logoped?.middleName||'')||'').toString().trim().slice(0,1).toUpperCase() || ''}`.trim()
      const when = formatTimeMsk(l.startsAt as any)
      const body = `У вашего ребёнка завтра занятие с ${fioL} в ${when}`
      data.push({ userId: parentUserId, type: 'BOOKING_UPDATE', payload: { title: 'Напоминание о занятии', body, url: '/parent/schedule' }, scheduledAt: new Date(), attempt: 0 })
    }
    if (data.length) { try { const r = await (prisma as any).pushEventQueue.createMany({ data, skipDuplicates: true }); enqueued += Number(r?.count||0) } catch {} }
  }

  // 4) Parent -1h reminders: lessons starting ~1h from now (window 55..65 min)
  {
    const nowUtc = new Date()
    const fromUtc = new Date(nowUtc.getTime() + 55*60*1000)
    const toUtc = new Date(nowUtc.getTime() + 65*60*1000)
    const lessons = await prisma.lesson.findMany({
      where: { startsAt: { gte: fromUtc, lte: toUtc } },
      select: { id: true, startsAt: true, logoped: { select: { firstName: true, lastName: true, middleName: true } }, enrolls: { select: { child: { select: { id: true, parent: { select: { userId: true } } } } } } }
    })
    const data: any[] = []
    for (const l of lessons) {
      const child = l.enrolls?.[0]?.child as any
      const parentUserId = child?.parent?.userId as string | undefined
      if (!parentUserId) continue
      const fioL = `${(l as any).logoped?.lastName||''} ${(((l as any).logoped?.firstName||'')||'').toString().trim().slice(0,1).toUpperCase()}.${(((l as any).logoped?.middleName||'')||'').toString().trim().slice(0,1).toUpperCase() || ''}`.trim()
      const body = `У вашего ребёнка через 1 час занятие с ${fioL}`
      data.push({ userId: parentUserId, type: 'BOOKING_UPDATE', payload: { title: 'Скоро занятие', body, url: '/parent/schedule' }, scheduledAt: new Date(), attempt: 0 })
    }
    if (data.length) { try { const r = await (prisma as any).pushEventQueue.createMany({ data, skipDuplicates: true }); enqueued += Number(r?.count||0) } catch {} }
  }

  return NextResponse.json({ ok: true, enqueued })
}
