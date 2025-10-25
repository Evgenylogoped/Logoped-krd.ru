"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

function ensureSuperOrAdmin(session: any) {
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(role)) throw new Error('Forbidden')
}

export async function assignOrgManager(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureSuperOrAdmin(session)
  const userId = String(formData.get('userId') || '')
  const organizationId = String(formData.get('organizationId') || '')
  if (!userId || !organizationId) return
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } })
  if (!user) return
  // Create scoped role for organization
  await prisma.userOrganizationRole.upsert({
    where: { userId_organizationId_role: { userId, organizationId, role: 'ORG_MANAGER' } },
    update: {},
    create: { userId, organizationId, role: 'ORG_MANAGER' },
  })
  await prisma.auditLog.create({ data: { action: 'ORG_MANAGER_ASSIGN', payload: JSON.stringify({ userId, organizationId }) } })
  revalidatePath('/admin/organizations')
}

export async function revokeOrgManager(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureSuperOrAdmin(session)
  const userId = String(formData.get('userId') || '')
  const organizationId = String(formData.get('organizationId') || '')
  if (!userId || !organizationId) return
  await prisma.userOrganizationRole.deleteMany({ where: { userId, organizationId, role: 'ORG_MANAGER' } })
  await prisma.auditLog.create({ data: { action: 'ORG_MANAGER_REVOKE', payload: JSON.stringify({ userId, organizationId }) } })
  revalidatePath('/admin/organizations')
}
