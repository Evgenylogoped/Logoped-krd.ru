"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function requestActivation(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any)?.role !== 'PARENT') throw new Error('Доступ запрещён')
  const parentUserId = (session.user as any).id as string
  const logopedEmail = String(formData.get('logopedEmail') || '').toLowerCase().trim()
  const note = String(formData.get('note') || '')
  if (!logopedEmail) throw new Error('Укажите e-mail логопеда')
  const parent = await prisma.parent.findUnique({ where: { userId: parentUserId } })
  if (!parent) throw new Error('Профиль родителя не найден')
  const logoped = await prisma.user.findUnique({ where: { email: logopedEmail } })
  if (!logoped || logoped.role !== 'LOGOPED') throw new Error('Логопед не найден')
  await prisma.activationRequest.create({ data: { parentId: parent.id, targetLogopedId: logoped.id, note } })
  revalidatePath('/parent')
}
