import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as any).role as string | undefined
  if (!role || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const q = (searchParams.get('q') || '').trim()
  const roleFilter = (searchParams.get('role') || '').trim()
  const city = (searchParams.get('city') || '').trim()

  const where: any = {}
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { id: q },
    ]
  }
  if (roleFilter) where.role = roleFilter
  if (city) where.city = city

  const items = await prisma.user.findMany({
    where,
    select: { id: true, name: true, email: true, phone: true },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
    take: 50,
  })
  return NextResponse.json({ items })
}
