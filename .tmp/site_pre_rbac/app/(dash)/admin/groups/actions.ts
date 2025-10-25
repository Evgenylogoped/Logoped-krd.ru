"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

function ensureAdmin(session: any) {
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(role)) throw new Error('Forbidden')
}

export async function createGroup(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureAdmin(session)
  const branchId = String(formData.get('branchId') || '')
  const name = String(formData.get('name') || '').trim()
  if (!branchId || !name) return
  await prisma.group.create({ data: { branchId, name } })
  revalidatePath('/admin/groups')
}

export async function updateGroup(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureAdmin(session)
  const id = String(formData.get('id') || '')
  const name = String(formData.get('name') || '').trim()
  if (!id || !name) return
  await prisma.group.update({ where: { id }, data: { name } })
  revalidatePath('/admin/groups')
}

export async function deleteGroup(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureAdmin(session)
  const id = String(formData.get('id') || '')
  if (!id) return
  await prisma.group.delete({ where: { id } })
  revalidatePath('/admin/groups')
}
