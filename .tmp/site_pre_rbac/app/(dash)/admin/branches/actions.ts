"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

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
  const company = await (prisma as any).company.findUnique({ where: { id: companyId }, include: { branches: true } })
  if (!company) throw new Error('Компания не найдена')
  const allowed = Number(company.allowedBranches || 0)
  const current = (company.branches || []).length
  if (allowed > 0 && current >= allowed) throw new Error('Достигнут лимит филиалов. Увеличение лимита доступно по заявке и может быть платным.')
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
