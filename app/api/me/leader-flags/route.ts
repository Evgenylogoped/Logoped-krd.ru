import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ isLeader: false, isOwner: false, branchManager: false })
  const userId = (session.user as any)?.id as string
  const role = (session.user as any)?.role as string

  // Лидер/владелец может иметь глобальную роль LOGOPED, поэтому проверяем организационные связи
  const me = await (prisma as any).user.findUnique({ where: { id: userId }, include: { ownedCompanies: { select: { id: true } }, managedBranches: { select: { id: true } } } })
  const isOwner = Boolean((me?.ownedCompanies?.length || 0) > 0)
  const branchManager = Boolean((me?.managedBranches?.length || 0) > 0)
  const isLeader = isOwner || branchManager || ['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)

  return NextResponse.json({ isLeader, isOwner, branchManager })
}
