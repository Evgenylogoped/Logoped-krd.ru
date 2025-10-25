import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const session: any = await getServerSession(authOptions as any)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) return new NextResponse('Forbidden', { status: 403 })
  const since = new Date(Date.now() - 7*24*60*60*1000)
  const cnt = await prisma.auditLog.count({ where: { action: 'PLAN_CHANGE_REQUEST', createdAt: { gte: since } } })
  return NextResponse.json({ ok: true, count: cnt })
}
