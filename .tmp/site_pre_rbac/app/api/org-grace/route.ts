import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const sessionAny: any = await getServerSession(authOptions as any)
  if (!sessionAny?.user) return NextResponse.json({ ok: true })
  const user = sessionAny.user as any
  const me = await (prisma as any).user.findUnique({ where: { id: user.id }, include: { branch: { select: { id: true, companyId: true } } } })
  if (!me) return NextResponse.json({ ok: true })
  if (me.orgGraceUntil && new Date(me.orgGraceUntil).getTime() < Date.now()) {
    const prevCompanyId = me.branch?.companyId as string | undefined
    await (prisma as any).user.update({ where: { id: me.id }, data: { branchId: null, orgGraceUntil: null } })
    if (prevCompanyId) {
      const remaining = await prisma.user.count({ where: { role: 'LOGOPED', branch: { companyId: prevCompanyId } } as any })
      if (remaining === 0) {
        const comp = await prisma.company.findUnique({ where: { id: prevCompanyId } }) as any
        if (comp) {
          await prisma.$transaction(async (tx) => {
            if (!comp.liquidatedAt) {
              await tx.company.update({ where: { id: prevCompanyId }, data: { liquidatedAt: new Date() } as any })
            }
            const branches = await tx.branch.findMany({ where: { companyId: prevCompanyId }, select: { id: true } })
            const branchIds = branches.map(b => b.id)
            if (branchIds.length) {
              await tx.user.updateMany({ where: { branchId: { in: branchIds } } as any, data: { branchId: null, orgGraceUntil: null } as any })
            }
            await tx.branch.deleteMany({ where: { companyId: prevCompanyId } })
            await tx.company.delete({ where: { id: prevCompanyId } })
          })
        }
      }
    }
    return NextResponse.json({ ok: true, cleared: true })
  }
  return NextResponse.json({ ok: true, cleared: false })
}
