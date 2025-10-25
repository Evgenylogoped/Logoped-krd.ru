"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

function ensureAccountant(session: any) {
  const role = session?.user?.role
  if (!session || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) {
    throw new Error('Доступ запрещён')
  }
}

export async function activateMonths(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const email = String(formData.get('email') || '').toLowerCase().trim()
  const months = Math.max(1, Number(formData.get('months') || '1') || 1)
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error('Пользователь не найден')
  const now = new Date()
  const base = user.activatedUntil && user.activatedUntil > now ? user.activatedUntil : now
  const until = new Date(base)
  until.setMonth(until.getMonth() + months)
  await prisma.user.update({ where: { id: user.id }, data: { activatedUntil: until, activatedForever: false } })
  revalidatePath('/admin/activation')
}

export async function activateForever(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const email = String(formData.get('email') || '').toLowerCase().trim()
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error('Пользователь не найден')
  await prisma.user.update({ where: { id: user.id }, data: { activatedForever: true, activatedUntil: null } })
  revalidatePath('/admin/activation')
}

export async function deactivate(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const email = String(formData.get('email') || '').toLowerCase().trim()
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error('Пользователь не найден')
  await prisma.user.update({ where: { id: user.id }, data: { activatedForever: false, activatedUntil: null } })
  revalidatePath('/admin/activation')
}
