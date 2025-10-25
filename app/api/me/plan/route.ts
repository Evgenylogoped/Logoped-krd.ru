import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserPlan, getPlanRemainingDays } from '@/lib/subscriptions'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session: any = await getServerSession(authOptions as any)
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })
  const userId = (session.user as any).id as string
  const plan = await getUserPlan(userId)
  const daysLeft = await getPlanRemainingDays(userId)
  return NextResponse.json({ ok: true, plan, daysLeft })
}
