import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  const role = (session?.user as any)?.role as string | undefined
  if (!session || !userId || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(String(role))) {
    return NextResponse.json({ count: 0 }, { status: 200 })
  }
  const now = new Date()
  try {
    // Считаем уроки логопеда, которые прошли и не имеют финального статуса (DONE/CONFIRMED/CANCELLED)
    const lessons = await (prisma as any).lesson.findMany({
      where: {
        logopedId: userId,
        endsAt: { lt: now },
        OR: [
          { enrolls: { some: { status: 'ENROLLED' } } },
          { bookings: { some: { status: 'ACTIVE' } } },
        ],
      },
      select: { id: true, evaluations: { select: { status: true } } },
      take: 500,
    })
    const needs = (lessons as any[]).filter(L => {
      const evs = (L.evaluations||[]) as any[]
      const hasFinal = evs.some(ev => ['DONE','CONFIRMED','CANCELLED'].includes(ev.status))
      return !hasFinal
    })
    return NextResponse.json({ count: needs.length }, { status: 200 })
  } catch {
    return NextResponse.json({ count: 0 }, { status: 200 })
  }
}
