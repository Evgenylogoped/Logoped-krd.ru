import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

export default async function AdminFinanceIndex() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const userId = (session?.user as any)?.id
  if (!session) return <div className="container py-6">Доступ запрещён</div>
  // Разрешаем: ADMIN/SUPER_ADMIN/ACCOUNTANT, а также LOGOPED если он руководитель филиала или владелец компании
  let allowed = ['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)
  if (!allowed && role === 'LOGOPED') {
    const me = await (prisma as any).user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } })
    const ownerCompany = await (prisma as any).company.findFirst({ where: { ownerId: userId }, select: { id: true } })
    const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: userId }, select: { id: true } })
    const isOwner = Boolean(me?.branch?.company?.ownerId === userId) || Boolean(ownerCompany)
    const isBranchManager = Boolean(me?.branch?.managerId === userId) || Boolean(managesAny)
    allowed = isOwner || isBranchManager
  }
  if (!allowed) return <div className="container py-6">Доступ запрещён</div>
  return (
    <div className="container py-6">
      <div className="text-sm text-muted">Выберите подраздел выше.</div>
    </div>
  )
}
