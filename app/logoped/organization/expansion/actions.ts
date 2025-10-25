"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function requestExpansion(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const user = session.user as any
  if (!['LOGOPED','ADMIN','SUPER_ADMIN'].includes(user.role)) throw new Error('Forbidden')
  const type = String(formData.get('type') || '').toUpperCase()
  const branchesStr = String(formData.get('requestedBranches') || '').trim()
  const logopedsStr = String(formData.get('requestedLogopeds') || '').trim()
  const requestedBranches = branchesStr ? Number(branchesStr) : null
  const requestedLogopeds = logopedsStr ? Number(logopedsStr) : null

  const me = await (prisma as any).user.findUnique({ where: { id: user.id }, include: { branch: { include: { company: true } } } })
  const companyId = me?.branch?.companyId || null
  if (!companyId) throw new Error('Вы не состоите в организации')
  if (type !== 'BRANCHES' && type !== 'LOGOPEDS') throw new Error('Некорректный тип заявки')
  if (type === 'BRANCHES' && (!requestedBranches || requestedBranches <= 0)) throw new Error('Укажите количество филиалов')
  if (type === 'LOGOPEDS' && (!requestedLogopeds || requestedLogopeds <= 0)) throw new Error('Укажите количество логопедов')

  await (prisma as any).organizationExpansionRequest.create({
    data: {
      requesterId: user.id,
      companyId,
      type,
      requestedBranches: requestedBranches || undefined,
      requestedLogopeds: requestedLogopeds || undefined,
    },
  })
  revalidatePath('/logoped/organization/expansion')
  redirect('/logoped/organization/expansion?sent=1')
}
