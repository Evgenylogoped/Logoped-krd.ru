"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendMail } from '@/lib/mail'

export async function requestOrganization(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const user = session.user as any
  if (!['LOGOPED','ADMIN','SUPER_ADMIN'].includes(user.role)) throw new Error('Forbidden')
  const name = String(formData.get('name') || '').trim()
  const website = String(formData.get('website') || '').trim() || null
  const about = String(formData.get('about') || '').trim() || null
  if (!name) throw new Error('Введите название организации')
  // Запретить параллельную подачу и повтор при наличии одобренной / текущей организации
  const me = await prisma.user.findUnique({ where: { id: user.id }, include: { branch: { include: { company: true } } } })
  if (me?.branch?.companyId) {
    // уже в организации — показываем на странице как одобренную
    revalidatePath('/logoped/organization/request')
    redirect('/logoped/organization/request?sent=1')
  }
  const pending = await prisma.organizationRequest.findFirst({ where: { requesterId: user.id, status: 'PENDING' } })
  if (pending) {
    revalidatePath('/logoped/organization/request')
    redirect('/logoped/organization/request?err=pending')
  }
  // Создать новую (повторная подача разрешена, если до этого была REJECTED)
  const created = await prisma.organizationRequest.create({ data: { requesterId: user.id, name, website: website || undefined, about: about || undefined } })
  // уведомить бухгалтерию/админов о новой заявке
  try {
    const accountingEmail = process.env.ACCOUNTING_EMAIL || process.env.SMTP_USER || ''
    if (accountingEmail) {
      await sendMail({ to: accountingEmail, subject: 'Новая заявка на организацию', text: `Логопед: ${me?.name || me?.email}\nНазвание: ${name}\nСайт: ${website || '—'}\nЗаявка: ${created.id}` })
    }
  } catch {}
  revalidatePath('/admin/org-requests')
  revalidatePath('/logoped/organization/request')
  redirect('/logoped/organization/request?sent=1')
}

export async function cancelOrganizationRequest(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const user = session.user as any
  const requestId = String(formData.get('requestId') || '')
  if (!requestId) throw new Error('Нет requestId')
  const req = await prisma.organizationRequest.findUnique({ where: { id: requestId } })
  if (!req || req.requesterId !== user.id || req.status !== 'PENDING') throw new Error('Заявка не найдена или уже обработана')
  await prisma.organizationRequest.update({ where: { id: requestId }, data: { status: 'REJECTED', reason: 'Отменено пользователем', decidedAt: new Date() } })
  revalidatePath('/logoped/organization/request')
  redirect('/logoped/organization/request?cancelled=1')
}
