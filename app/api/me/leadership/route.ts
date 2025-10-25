import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id
  const role = (session?.user as any)?.role
  if (!session || !userId || role !== 'LOGOPED') return NextResponse.json({ isLeader: false, inOrg: false })

  const me = await (prisma as any).user.findUnique({ where: { id: userId }, include: { branch: true } })
  const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: userId }, select: { id: true } })
  const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: userId }, select: { id: true } })

  const isLeader = Boolean(ownedCompany) || Boolean(managesAny)
  const inOrg = Boolean(me?.branchId)
  return NextResponse.json({ isLeader, inOrg })
}
