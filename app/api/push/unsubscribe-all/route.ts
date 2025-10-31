import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = (session.user as any).id as string
  try {
    await (prisma as any).webPushSubscription.deleteMany({ where: { userId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const details = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'DB_ERROR', details }, { status: 500 })
  }
}
