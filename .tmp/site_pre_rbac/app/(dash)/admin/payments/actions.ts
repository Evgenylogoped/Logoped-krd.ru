"use server"
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function ensureRoles(session: any, roles: string[]) {
  const role = (session?.user as any)?.role
  if (!session || !roles.includes(role)) throw new Error('Forbidden')
}

export async function createPayment(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureRoles(session, ['ADMIN','SUPER_ADMIN','ACCOUNTANT'])
  const parentEmail = String(formData.get('parentEmail') || '').toLowerCase().trim()
  const amount = Number(formData.get('amount') || 0)
  if (!parentEmail || !amount) return

  const parentUser = await prisma.user.findUnique({ where: { email: parentEmail } })
  if (!parentUser) return
  const parent = await prisma.parent.findUnique({ where: { userId: parentUser.id } })
  if (!parent) return

  await prisma.payment.create({ data: { parentId: parent.id, amount, status: 'PENDING' } })
  revalidatePath('/admin/payments')
  return
}

export async function updatePaymentStatus(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureRoles(session, ['ADMIN','SUPER_ADMIN','ACCOUNTANT'])
  const id = String(formData.get('id') || '')
  const status = String(formData.get('status') || '')
  await prisma.payment.update({ where: { id }, data: { status } })
  revalidatePath('/admin/payments')
  return
}

export async function deletePayment(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureRoles(session, ['ADMIN','SUPER_ADMIN','ACCOUNTANT'])
  const id = String(formData.get('id') || '')
  await prisma.payment.delete({ where: { id } })
  revalidatePath('/admin/payments')
  return
}
