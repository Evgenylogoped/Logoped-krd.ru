"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendMail } from '@/lib/mail'

function ensureParent(session: any) {
  const role = (session?.user as any)?.role
  if (!session?.user || role !== 'PARENT') throw new Error('Forbidden')
}

export async function requestConsultation(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const parentUserId = (session!.user as any).id as string
  const logopedId = String(formData.get('logopedId') || '')
  const note = String(formData.get('note') || '').trim() || undefined
  if (!logopedId) return
  // Найти руководителя логопеда (если есть)
  const supervisors = await prisma.userSupervisor.findMany({ where: { subordinateId: logopedId } })
  const logoped = await prisma.user.findUnique({ where: { id: logopedId } })
  const parent = await prisma.parent.findUnique({ where: { userId: parentUserId } })
  // Отправить письма: логопеду и его руководителям
  const emails: string[] = []
  if (logoped?.email) emails.push(logoped.email)
  if (supervisors.length) {
    const supUsers = await prisma.user.findMany({ where: { id: { in: supervisors.map(s => s.supervisorId) } } })
    emails.push(...supUsers.map(u => u.email).filter(Boolean) as string[])
  }
  if (emails.length) {
    await Promise.all(emails.map(to => sendMail({ to, subject: 'Запрос консультации', text: `Родитель оставил запрос консультации${parent?.fullName? ' ('+parent.fullName+')' : ''}.${note? '\nКомментарий: '+note : ''}` })))
  }
  revalidatePath('/settings/logoped-search')
  redirect('/settings/logoped-search?consult=sent')
}

export async function requestActivation(formData: FormData) {
  // Прикрепление = активация профиля
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const parentUserId = (session!.user as any).id as string
  const logopedId = String(formData.get('logopedId') || '')
  const note = String(formData.get('note') || '').trim() || undefined
  if (!logopedId) return
  const parent = await prisma.parent.findUnique({ where: { userId: parentUserId } })
  if (!parent) return
  // Создать заявку на активацию
  await prisma.activationRequest.create({ data: { parentId: parent.id, targetLogopedId: logopedId, note } as any })
  // Уведомить логопеда и его руководителя (если есть)
  const logoped = await prisma.user.findUnique({ where: { id: logopedId } })
  const supervisors = await prisma.userSupervisor.findMany({ where: { subordinateId: logopedId } })
  const emails: string[] = []
  if (logoped?.email) emails.push(logoped.email)
  if (supervisors.length) {
    const supUsers = await prisma.user.findMany({ where: { id: { in: supervisors.map(s => s.supervisorId) } } })
    emails.push(...supUsers.map(u => u.email).filter(Boolean) as string[])
  }
  if (emails.length) {
    await Promise.all(emails.map(to => sendMail({ to, subject: 'Запрос на прикрепление', text: `Родитель запросил прикрепление${parent.fullName? ' ('+parent.fullName+')' : ''}.${note? '\nКомментарий: '+note : ''}` })))
  }
  revalidatePath('/settings/logoped-search')
  redirect('/settings/logoped-search?activation=requested')
}
