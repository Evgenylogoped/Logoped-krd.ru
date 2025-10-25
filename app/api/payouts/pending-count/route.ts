import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ count: 0 })
  const role = (session.user as any)?.role as string
  const userId = (session.user as any)?.id as string

  // Счётчик заявок на выплату в ожидании для лидеров/бухгалтеров/админов/владельцев
  const isAdminLike = ['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)
  let where: any = { status: 'PENDING' }
  if (isAdminLike) {
    // всё доступно
  } else if (role === 'LOGOPED') {
    // выясним, является ли пользователь владельцем компании или менеджером филиала
    const me = await (prisma as any).user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } })
    const ownsCompany = await (prisma as any).company.findFirst({ where: { ownerId: userId }, select: { id: true } })
    const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: userId }, select: { id: true } })
    const isOwner = Boolean((me as any)?.branch?.company?.ownerId === userId) || Boolean(ownsCompany)
    const isBranchManager = Boolean((me as any)?.branch?.managerId === userId) || Boolean(managesAny)

    if (isOwner) {
      // все логопеды компании владельца
      const companyId = (me as any)?.branch?.companyId || (ownsCompany as any)?.id
      where = { status: 'PENDING', logoped: { branch: { companyId } } }
    } else if (isBranchManager) {
      const branchId = (me as any)?.branchId || (managesAny as any)?.id
      where = { status: 'PENDING', logoped: { branchId } }
    } else {
      // обычный логопед — только его собственные
      where = { status: 'PENDING', logopedId: userId }
    }
  }

  const count = await (prisma as any).payoutRequest.count({ where })
  return NextResponse.json({ count })
}
