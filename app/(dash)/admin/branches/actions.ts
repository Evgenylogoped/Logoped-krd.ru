"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getUserPlan, getLimits } from '@/lib/subscriptions'
import { redirect } from 'next/navigation'

function ensureAdmin(session: any) {
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(role)) throw new Error('Forbidden')
}

export async function createBranch(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureAdmin(session)
  const companyId = String(formData.get('companyId') || '')
  const name = String(formData.get('name') || '').trim()
  const address = String(formData.get('address') || '').trim() || undefined
  if (!companyId || !name) return
  // Проверка лимита филиалов
  const company = await (prisma as any).company.findUnique({ where: { id: companyId }, include: { branches: true, owner: { select: { id: true } } } })
  if (!company) throw new Error('Компания не найдена')
  // Если лимит в компании не задан — возьмём из плана владельца
  let allowed = Number(company.allowedBranches || 0)
  if (!allowed && company.owner?.id) {
    const plan = await getUserPlan(company.owner.id)
    const limits = await getLimits(plan)
    allowed = Number(limits.branches || 0)
  }
  const current = (company.branches || []).length
  if (allowed > 0 && current >= allowed) {
    revalidatePath('/admin/branches')
    redirect('/admin/branches?err=branches_limit')
  }
  await prisma.branch.create({ data: { companyId, name, address } })
  revalidatePath('/admin/branches')
}

export async function updateBranch(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureAdmin(session)
  const id = String(formData.get('id') || '')
  const name = String(formData.get('name') || '').trim()
  const address = String(formData.get('address') || '').trim() || undefined
  if (!id || !name) return
  await prisma.branch.update({ where: { id }, data: { name, address } })
  revalidatePath('/admin/branches')
}

export async function deleteBranch(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureAdmin(session)
  const id = String(formData.get('id') || '')
  if (!id) return
  await prisma.branch.delete({ where: { id } })
  revalidatePath('/admin/branches')
}

export async function assignBranchManager(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureAdmin(session)
  let userId = String(formData.get('userId') || '')
  const userEmail = String(formData.get('userEmail') || '').toLowerCase().trim()
  const branchId = String(formData.get('branchId') || '')
  if (!userId || !branchId) return
  if (!userId && userEmail) {
    const u = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } })
    if (!u) return
    userId = u.id
  }
  await prisma.userBranchRole.upsert({
    where: { userId_branchId_role: { userId, branchId, role: 'BRANCH_MANAGER' } },
    update: {},
    create: { userId, branchId, role: 'BRANCH_MANAGER' },
  })
  await prisma.auditLog.create({ data: { action: 'BRANCH_MANAGER_ASSIGN', payload: JSON.stringify({ userId, branchId }) } })
  revalidatePath('/admin/branches')
}

export async function revokeBranchManager(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureAdmin(session)
  let userId = String(formData.get('userId') || '')
  const userEmail = String(formData.get('userEmail') || '').toLowerCase().trim()
  const branchId = String(formData.get('branchId') || '')
  if (!userId && userEmail) {
    const u = await prisma.user.findUnique({ where: { email: userEmail }, select: { id: true } })
    if (!u) return
    userId = u.id
  }
  if (!userId || !branchId) return
  await prisma.userBranchRole.deleteMany({ where: { userId, branchId, role: 'BRANCH_MANAGER' } })
  await prisma.auditLog.create({ data: { action: 'BRANCH_MANAGER_REVOKE', payload: JSON.stringify({ userId, branchId }) } })
  revalidatePath('/admin/branches')
}
