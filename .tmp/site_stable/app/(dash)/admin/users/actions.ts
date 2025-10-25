"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

function ensureSuperOrAdmin(session: any) {
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(role)) throw new Error('Forbidden')
}

export async function updateUserRole(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureSuperOrAdmin(session)
  const id = String(formData.get('id') || '')
  const role = String(formData.get('role') || '')
  if (!id || !role) return
  await prisma.user.update({ where: { id }, data: { role } })
  revalidatePath('/admin/users')
}
