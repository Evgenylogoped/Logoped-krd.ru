"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
function ensureLogoped(session: any) {
  const role = session?.user?.role
  if (!session || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role)) {
    throw new Error('Доступ запрещён')
  }
}

export async function markAllRead() {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const userId = (session!.user as any).id as string
  await prisma.user.update({ where: { id: userId }, data: { lastNotificationsSeenAt: new Date() } })
  revalidatePath('/logoped/notifications')
}

export async function approveParentActivation(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const logopedId = (session!.user as any).id as string
  const reqId = String(formData.get('requestId') || '')
  if (!reqId) throw new Error('Нет requestId')
  const req = await prisma.activationRequest.findUnique({ where: { id: reqId }, include: { parent: true } })
  if (!req || req.targetLogopedId !== logopedId || req.status !== 'PENDING') throw new Error('Заявка не найдена или уже обработана')
  await prisma.$transaction([
    prisma.activationRequest.update({ where: { id: reqId }, data: { status: 'APPROVED' } }),
    prisma.parent.update({ where: { id: req.parentId }, data: { isArchived: false } }),
  ])
  revalidatePath('/logoped/notifications')
}

export async function rejectParentActivation(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const logopedId = (session!.user as any).id as string
  const reqId = String(formData.get('requestId') || '')
  if (!reqId) throw new Error('Нет requestId')
  const req = await prisma.activationRequest.findUnique({ where: { id: reqId } })
  if (!req || req.targetLogopedId !== logopedId || req.status !== 'PENDING') throw new Error('Заявка не найдена или уже обработана')
  await prisma.activationRequest.update({ where: { id: reqId }, data: { status: 'REJECTED' } })
  revalidatePath('/logoped/notifications')
}
