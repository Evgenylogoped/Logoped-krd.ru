"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function createPass(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) throw new Error('Forbidden')

  const childId = String(formData.get('childId') || '')
  const logopedId = String(formData.get('logopedId') || '') || undefined
  const totalLessons = Number(formData.get('totalLessons') || '0')
  const totalPrice = Number(formData.get('totalPrice') || '0')
  const validUntilStr = String(formData.get('validUntil') || '')
  const validUntil = validUntilStr ? new Date(validUntilStr) : null

  if (!childId || totalLessons <= 0 || totalPrice < 0) throw new Error('Bad input')

  // Scope checks: owner/branch manager only within their branch; accountant — all
  const me = await (prisma as any).user.findUnique({ where: { id: (session!.user as any).id }, include: { branch: { include: { company: true } } } })
  const isOwner = Boolean(me?.branch?.company?.ownerId === (session!.user as any).id)
  const isBranchManager = Boolean(me?.branch?.managerId === (session!.user as any).id)

  if (role !== 'ACCOUNTANT') {
    const scopeBranchId = me?.branchId
    if (!scopeBranchId) throw new Error('No branch scope')
    const child = await (prisma as any).child.findUnique({ where: { id: childId }, include: { logoped: true } })
    const childLogopedBranch = child?.logoped?.branchId
    if (!child || !childLogopedBranch || childLogopedBranch !== scopeBranchId) throw new Error('Forbidden: child out of branch scope')
  }

  await (prisma as any).pass.create({
    data: {
      childId,
      logopedId: logopedId || null,
      totalLessons,
      remainingLessons: totalLessons,
      totalPrice,
      validUntil,
      status: 'ACTIVE',
    }
  })

  revalidatePath('/admin/finance/passes')
}
