"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendMail } from '@/lib/mail'

function ensureAccountant(session: any) {
  const role = (session?.user as any)?.role
  if (!session?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) throw new Error('Forbidden')
}

export async function approveOrganizationRequest(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const requestId = String(formData.get('requestId') || '')
  const allowedBranchesStr = String(formData.get('allowedBranches') || '').trim()
  const allowedBranches = Math.max(1, Number(allowedBranchesStr) || 1)
  const req = await (prisma as any).organizationRequest.findUnique({ where: { id: requestId } })
  if (!req || req.status !== 'PENDING') throw new Error('Заявка не найдена или уже обработана')
  // создать компанию и «Основной офис»
  const company = await prisma.company.create({ data: { name: req.name, website: req.website || undefined, about: req.about || undefined, allowedBranches, owner: { connect: { id: req.requesterId } } } as any })
  const main = await prisma.branch.create({ data: { companyId: company.id, name: 'Основной офис', managerId: req.requesterId } })
  // привязать владельца к «Основному офису»
  await prisma.user.update({ where: { id: req.requesterId }, data: { branch: { connect: { id: main.id } } } as any })
  await (prisma as any).organizationRequest.update({ where: { id: req.id }, data: { status: 'APPROVED', decidedAt: new Date() } })
  // notify requester
  const requester = await prisma.user.findUnique({ where: { id: req.requesterId } })
  if (requester?.email) {
    await sendMail({ to: requester.email, subject: 'Заявка на организацию утверждена', text: `Ваша заявка на создание организации "${company.name}" утверждена. Вам назначен первый филиал: "${main.name}".` })
  }
  revalidatePath('/admin/org-requests')
  redirect('/admin/org-requests?ok=approved')
}

export async function rejectOrganizationRequest(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const requestId = String(formData.get('requestId') || '')
  const reason = String(formData.get('reason') || '').trim()
  if (!reason) throw new Error('Укажите причину отказа')
  const req = await (prisma as any).organizationRequest.findUnique({ where: { id: requestId } })
  if (!req || req.status !== 'PENDING') throw new Error('Заявка не найдена или уже обработана')
  await (prisma as any).organizationRequest.update({ where: { id: requestId }, data: { status: 'REJECTED', reason, decidedAt: new Date() } })
  // notify requester
  const requester = await prisma.user.findUnique({ where: { id: req.requesterId } })
  if (requester?.email) {
    await sendMail({ to: requester.email, subject: 'Заявка на организацию отклонена', text: `Ваша заявка на создание организации отклонена. Причина: ${reason}` })
  }
  revalidatePath('/admin/org-requests')
  redirect('/admin/org-requests?ok=rejected')
}
