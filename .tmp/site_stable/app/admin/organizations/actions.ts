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

export async function deleteCompanyNow(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const companyId = String(formData.get('companyId') || '')
  if (!companyId) return
  const logCnt = await countCompanyLogopeds(companyId)
  if (logCnt > 0) {
    revalidatePath('/admin/organizations')
    redirect('/admin/organizations?err=not_empty')
    return
  }
  await finalizeCompanyNow(companyId)
  revalidatePath('/admin/organizations')
  redirect('/admin/organizations?ok=deleted')
}

async function countCompanyLogopeds(companyId: string): Promise<number> {
  const cnt = await prisma.user.count({ where: { role: 'LOGOPED', branch: { companyId } } as any })
  return cnt
}

async function finalizeCompanyNow(companyId: string) {
  // Отвязать всех пользователей, удалить зависимые записи, филиалы и саму компанию
  const branches = await prisma.branch.findMany({ where: { companyId }, select: { id: true } })
  const branchIds = branches.map(b => b.id)
  await prisma.$transaction(async (tx) => {
    // Снять пользователей с филиалов
    if (branchIds.length) {
      await tx.user.updateMany({ where: { branchId: { in: branchIds } } as any, data: { branchId: null, orgGraceUntil: null } as any })
    }
    // Найти группы и уроки
    const groups = branchIds.length ? await tx.group.findMany({ where: { branchId: { in: branchIds } }, select: { id: true } }) : []
    const groupIds = groups.map(g => g.id)
    if (groupIds.length) {
      // Удалить дочерние сущности уроков
      await tx.enrollment.deleteMany({ where: { lesson: { groupId: { in: groupIds } } } as any })
      await tx.booking.deleteMany({ where: { lesson: { groupId: { in: groupIds } } } as any })
      await tx.lessonEvaluation.deleteMany({ where: { lesson: { groupId: { in: groupIds } } } as any })
      await tx.consultationRequest.deleteMany({ where: { lesson: { groupId: { in: groupIds } } } as any })
      await tx.lesson.deleteMany({ where: { groupId: { in: groupIds } } as any })
      await tx.group.deleteMany({ where: { id: { in: groupIds } } })
    }
    // Удалить orgConsultationRequest, привязанные к филиалам
    if (branchIds.length) {
      await (tx as any).orgConsultationRequest?.deleteMany({ where: { branchId: { in: branchIds } } })
    }
    // Удалить филиалы и компанию
    await tx.branch.deleteMany({ where: { companyId } })
    await tx.company.delete({ where: { id: companyId } })
  })
}

export async function approveExpansionRequest(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const reqId = String(formData.get('reqId') || '')
  const req = await (prisma as any).organizationExpansionRequest.findUnique({ where: { id: reqId }, include: { company: true, requester: true } })
  if (!req || req.status !== 'PENDING') throw new Error('Заявка не найдена или уже обработана')
  const data: any = {}
  if (req.type === 'BRANCHES' && req.requestedBranches && req.requestedBranches > 0) data.allowedBranches = req.requestedBranches
  if (req.type === 'LOGOPEDS' && req.requestedLogopeds && req.requestedLogopeds > 0) data.allowedLogopeds = req.requestedLogopeds
  if (Object.keys(data).length === 0) throw new Error('Некорректные параметры заявки')
  const company: any = await (prisma as any).company.update({ where: { id: req.companyId }, data: data as any })
  await (prisma as any).organizationExpansionRequest.update({ where: { id: req.id }, data: { status: 'APPROVED', decidedAt: new Date() } })
  if (req.requester?.email) await sendMail({ to: req.requester.email, subject: 'Заявка на расширение лимитов одобрена', text: `Новые лимиты для организации "${company.name}": филиалы=${company.allowedBranches}, логопеды=${company.allowedLogopeds}.` })
  revalidatePath('/admin/organizations')
}

export async function rejectExpansionRequest(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const reqId = String(formData.get('reqId') || '')
  const reason = String(formData.get('reason') || '').trim()
  const req = await (prisma as any).organizationExpansionRequest.findUnique({ where: { id: reqId }, include: { requester: true } })
  if (!req || req.status !== 'PENDING') throw new Error('Заявка не найдена или уже обработана')
  await (prisma as any).organizationExpansionRequest.update({ where: { id: req.id }, data: { status: 'REJECTED', reason, decidedAt: new Date() } })
  if (req.requester?.email) await sendMail({ to: req.requester.email, subject: 'Заявка на расширение лимитов отклонена', text: `Причина: ${reason || 'не указана'}` })
  revalidatePath('/admin/organizations')
}

export async function updateCompanyLimits(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const companyId = String(formData.get('companyId') || '')
  const branches = Number(String(formData.get('allowedBranches') || '').trim() || '0')
  const logopeds = Number(String(formData.get('allowedLogopeds') || '').trim() || '0')
  const data: any = {}
  if (branches > 0) data.allowedBranches = branches
  if (logopeds > 0) data.allowedLogopeds = logopeds
  if (!companyId || Object.keys(data).length === 0) return
  await prisma.company.update({ where: { id: companyId }, data: data as any })
  revalidatePath('/admin/organizations')
}

export async function liquidateCompany(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const companyId = String(formData.get('companyId') || '')
  if (!companyId) return
  const company = await prisma.company.update({ where: { id: companyId }, data: { liquidatedAt: new Date() } as any })
  // set 15-day grace for all users in company
  const graceUntil = new Date(Date.now() + 15*24*60*60*1000)
  const branches = await prisma.branch.findMany({ where: { companyId } })
  const branchIds = branches.map(b => b.id)
  if (branchIds.length) {
    await prisma.user.updateMany({ where: { branchId: { in: branchIds } } as any, data: { orgGraceUntil: graceUntil } as any })
    const users = await prisma.user.findMany({ where: { branchId: { in: branchIds } } as any })
    // notify
    await Promise.all(users.map(u => u.email ? sendMail({ to: u.email, subject: 'Организация ликвидирована', text: `Организация "${company.name}" ликвидирована. У вас есть 15 дней для перехода в другую действующую организацию.` }) : Promise.resolve()))
  }
  // Если в компании нет логопедов — удалить немедленно
  const logCnt = await countCompanyLogopeds(companyId)
  if (logCnt === 0) {
    await finalizeCompanyNow(companyId)
    revalidatePath('/admin/organizations')
    redirect('/admin/organizations?ok=deleted')
    return
  }
  revalidatePath('/admin/organizations')
  redirect('/admin/organizations?ok=liquidated')
}
