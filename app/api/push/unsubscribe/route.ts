import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let json: any
  try { json = await req.json() } catch { return NextResponse.json({ error: 'Bad JSON' }, { status: 400 }) }
  const { endpoint } = json || {}
  if (!endpoint) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  try {
    await (prisma as any).webPushSubscription.delete({ where: { endpoint } })
  } catch {}
  return NextResponse.json({ ok: true })
}
