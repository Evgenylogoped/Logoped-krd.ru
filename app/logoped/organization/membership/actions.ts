"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getUserPlan, getLimits } from '@/lib/subscriptions'
import { redirect } from 'next/navigation'
import { sendMail } from '@/lib/mail'

export async function requestMembership(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const user = session.user as any
  if (!['LOGOPED','ADMIN','SUPER_ADMIN'].includes(user.role)) throw new Error('Forbidden')
  const leaderEmail = String(formData.get('leaderEmail') || '').toLowerCase().trim()
  if (!leaderEmail) throw new Error('Введите email руководителя')
  const me = await (prisma as any).user.findUnique({ where: { id: user.id }, include: { branch: { include: { company: true } } } })
  if (me?.branchId) {
    revalidatePath('/logoped/organization/membership')
  revalidatePath('/logoped/organization/memberships')
  revalidatePath('/settings/organization/memberships')
    redirect('/logoped/organization/membership?err=in_org')
  }
  const pending = await (prisma as any).organizationMembershipRequest.findFirst({ where: { requesterId: user.id, status: 'PENDING' } })
  if (pending) {
    revalidatePath('/logoped/organization/membership')
    redirect('/logoped/organization/membership?err=pending')
  }
  await (prisma as any).organizationMembershipRequest.create({ data: { requesterId: user.id, leaderEmail } })
  const leader = await prisma.user.findUnique({ where: { email: leaderEmail } }).catch(()=>null)
  if (leader?.email) {
    await sendMail({ to: leader.email, subject: 'Запрос на вступление в организацию', text: 'У вас новый запрос на вступление в организацию от логопеда.' })
  }
  revalidatePath('/logoped/organization/membership')
  redirect('/logoped/organization/membership?sent=1')
}

export async function leaveOrganization() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const me = await prisma.user.findUnique({ where: { id: (session.user as any).id }, include: { branch: { include: { company: true } } } }) as any
  if (!me?.branchId) return
  // Нельзя, если я владелец компании
  if (me?.branch?.company?.ownerId === me.id) {
    redirect('/logoped/organization/membership?err=owner_cannot_leave')
  }
  // Проверяем незакрытые организационные начисления (SQLite-friendly)
  const raw = await (prisma as any).lesson.findMany({
    where: { logopedId: me.id, settledAt: { not: null, lt: new Date() }, payoutStatus: 'NONE' },
    include: { transactions: true },
    take: 2000,
  })
  const unsettled = (raw as any[]).filter(L => (L.transactions||[]).some((t:any)=> Boolean(t?.companyId))).length
  if (unsettled > 0) {
    redirect('/logoped/organization/membership?err=billing_block')
  }
  await prisma.user.update({ where: { id: me.id }, data: { branchId: null } })
  revalidatePath('/settings/organization')
  revalidatePath('/settings/organization/members')
  revalidatePath('/settings/organization/memberships')
  revalidatePath('/logoped/organization/membership')
  redirect('/logoped/organization/membership?left=1')
}

export async function acceptInvite(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const me = session.user as any
  const reqId = String(formData.get('reqId') || '')
  if (!reqId) throw new Error('Нет reqId')
  // load request (reason must be INVITE and requester is me)
  const req = await prisma.organizationMembershipRequest.findUnique({ where: { id: reqId } })
  if (!req || req.status !== 'PENDING') throw new Error('Заявка не найдена или уже обработана')
  if ((req as any).reason !== 'INVITE') throw new Error('Это не приглашение руководителя')
  if (req.requesterId !== me.id) throw new Error('Forbidden')
  // ensure I am free
  const requester = await prisma.user.findUnique({ where: { id: me.id }, include: { branch: { include: { company: true } } } }) as any
  if (requester?.branchId) throw new Error('Вы уже состоите в организации')
  // find leader by email and resolve company/main office
  let leader = await prisma.user.findUnique({ where: { email: req.leaderEmail.toLowerCase() }, include: { branch: { include: { company: true } } } }) as any
  // If leader has no company, bootstrap one automatically
  if (!leader?.branch?.companyId) {
    const createdCompany = await prisma.company.create({ data: { name: leader?.name || leader?.email || 'Организация', owner: { connect: { id: leader.id } } } as any })
    const main = await prisma.branch.create({ data: { companyId: createdCompany.id, name: 'Основной офис', managerId: leader.id } })
    await prisma.user.update({ where: { id: leader.id }, data: { branchId: main.id } })
    leader = await prisma.user.findUnique({ where: { id: leader.id }, include: { branch: { include: { company: true } } } }) as any
  }
  const company = await prisma.company.findUnique({ where: { id: leader.branch.companyId }, include: { owner: true, branches: true } }) as any
  if (!company) throw new Error('Компания не найдена')
  // ensure main office
  let main = (company.branches || []).find((b:any)=> (b.name||'').toLowerCase()==='основной офис')
  if (!main) {
    main = await prisma.branch.create({ data: { companyId: company.id, name: 'Основной офис', managerId: company.ownerId || undefined } as any })
  } else if (!main.managerId && company.ownerId) {
    await prisma.branch.update({ where: { id: main.id }, data: { managerId: company.ownerId } })
  }
  // owner should be in main office
  if (company.ownerId) {
    const owner = await prisma.user.findUnique({ where: { id: company.ownerId } })
    if (owner && owner.branchId !== main.id) {
      await prisma.user.update({ where: { id: owner.id }, data: { branchId: main.id } })
    }
  }
  // check company limits
  const currentLogopeds = await prisma.user.count({ where: { role: 'LOGOPED', branch: { companyId: company.id } } })
  let allowedLogopeds = Number(company.allowedLogopeds || 0)
  if (!allowedLogopeds && company.ownerId) {
    const plan = await getUserPlan(company.ownerId)
    const limits = await getLimits(plan)
    allowedLogopeds = Number(limits.logopeds || 0)
  }
  if (allowedLogopeds > 0 && currentLogopeds >= allowedLogopeds) {
    await prisma.organizationMembershipRequest.update({ where: { id: req.id }, data: { status: 'REJECTED', reason: 'Превышен лимит логопедов в компании', decidedAt: new Date() } })
    throw new Error('В компании достигнут лимит логопедов')
  }
  // approve and attach
  await prisma.$transaction([
    prisma.organizationMembershipRequest.update({ where: { id: req.id }, data: { status: 'APPROVED', decidedAt: new Date(), targetCompanyId: company.id } }),
    prisma.user.update({ where: { id: me.id }, data: { branchId: main.id } }),
  ])
  // notify leader
  try {
    if (leader?.email) await sendMail({ to: leader.email, subject: 'Приглашение принято', text: `Логопед ${requester?.name || requester?.email || ''} принял приглашение и добавлен в «Основной офис».` })
  } catch {}
  revalidatePath('/logoped/organization/membership')
  redirect('/logoped/organization/membership?sent=1')
}

export async function declineInvite(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const me = session.user as any
  const reqId = String(formData.get('reqId') || '')
  const reason = String(formData.get('reason') || '').trim() || null
  if (!reqId) throw new Error('Нет reqId')
  const req = await prisma.organizationMembershipRequest.findUnique({ where: { id: reqId } })
  if (!req || req.status !== 'PENDING') return
  if ((req as any).reason !== 'INVITE') throw new Error('Это не приглашение руководителя')
  if (req.requesterId !== me.id) throw new Error('Forbidden')
  await prisma.organizationMembershipRequest.update({ where: { id: req.id }, data: { status: 'REJECTED', reason, decidedAt: new Date() } })
  // notify leader
  try {
    const leader = await prisma.user.findUnique({ where: { email: req.leaderEmail.toLowerCase() } })
    if (leader?.email) await sendMail({ to: leader.email, subject: 'Приглашение отклонено', text: `Логопед отклонил приглашение${reason ? `: ${reason}` : ''}.` })
  } catch {}
  revalidatePath('/logoped/organization/membership')
}

export async function cancelMembershipRequest(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const user = session.user as any
  const reqId = String(formData.get('reqId') || '')
  if (!reqId) throw new Error('Нет reqId')
  const req = await prisma.organizationMembershipRequest.findUnique({ where: { id: reqId } })
  if (!req || req.requesterId !== user.id || req.status !== 'PENDING') throw new Error('Заявка не найдена или уже обработана')
  await prisma.organizationMembershipRequest.update({ where: { id: reqId }, data: { status: 'REJECTED', reason: 'Отменено пользователем', decidedAt: new Date() } })
  revalidatePath('/logoped/organization/membership')
  revalidatePath('/logoped/organization/memberships')
  revalidatePath('/settings/organization/memberships')
  redirect('/logoped/organization/membership?cancelled=1')
}

export async function rejectMembership(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const leader = session.user as any
  const reqId = String(formData.get('reqId') || '')
  const reason = String(formData.get('reason') || '').trim() || null
  const req = await prisma.organizationMembershipRequest.findUnique({ where: { id: reqId } })
  if (!req || req.status !== 'PENDING') return
  if (req.leaderEmail.toLowerCase() !== String(leader.email || '').toLowerCase()) throw new Error('Forbidden')
  await (prisma as any).organizationMembershipRequest.update({ where: { id: req.id }, data: { status: 'REJECTED', reason, decidedAt: new Date() } })
  const requester = await prisma.user.findUnique({ where: { id: req.requesterId } })
  if (requester?.email) await sendMail({ to: requester.email, subject: 'Заявка на вступление отклонена', text: `Заявка отклонена${reason ? `: ${reason}` : ''}` })
  revalidatePath('/logoped/organization/memberships')
  revalidatePath('/settings/organization/memberships')
  redirect('/settings/organization/memberships?done=rejected')
}

export async function approveMembership(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const leader = session.user as any
  const reqId = String(formData.get('reqId') || '')
  if (!reqId) throw new Error('Нет reqId')
  // load request
  const req = await prisma.organizationMembershipRequest.findUnique({ where: { id: reqId } })
  if (!req || req.status !== 'PENDING') throw new Error('Заявка не найдена или уже обработана')
  if (req.leaderEmail.toLowerCase() !== String(leader.email || '').toLowerCase()) throw new Error('Forbidden')
  const requester = await prisma.user.findUnique({ where: { id: req.requesterId }, include: { branch: { include: { company: true } } } })
  if (!requester) throw new Error('Пользователь не найден')
  // determine leader org/branch
  const leaderUser = await prisma.user.findUnique({ where: { id: leader.id }, include: { branch: { include: { company: true } } } }) as any
  if (!leaderUser?.branch?.companyId) throw new Error('У руководителя не определена компания')
  const company = await prisma.company.findUnique({ where: { id: leaderUser.branch.companyId }, include: { owner: true, branches: true } }) as any
  if (!company) throw new Error('Компания не найдена')
  // ensure main office exists and owner is manager
  let main = (company.branches || []).find((b:any)=> (b.name||'').toLowerCase()==='основной офис')
  if (!main) {
    main = await prisma.branch.create({ data: { companyId: company.id, name: 'Основной офис', managerId: company.ownerId || undefined } as any })
  } else if (!main.managerId && company.ownerId) {
    await prisma.branch.update({ where: { id: main.id }, data: { managerId: company.ownerId } })
  }
  // ensure owner in main office
  if (company.ownerId) {
    const owner = await prisma.user.findUnique({ where: { id: company.ownerId } })
    if (owner && owner.branchId !== main.id) {
      await prisma.user.update({ where: { id: owner.id }, data: { branchId: main.id } })
    }
  }
  // check company limits
  const currentLogopeds = await prisma.user.count({ where: { role: 'LOGOPED', branch: { companyId: company.id } } })
  let allowedLogopeds = Number(company.allowedLogopeds || 0)
  if (!allowedLogopeds && company.ownerId) {
    const plan = await getUserPlan(company.ownerId)
    const limits = await getLimits(plan)
    allowedLogopeds = Number(limits.logopeds || 0)
  }
  if (allowedLogopeds > 0 && currentLogopeds >= allowedLogopeds) {
    await prisma.organizationMembershipRequest.update({ where: { id: req.id }, data: { status: 'REJECTED', reason: 'Превышен лимит логопедов в компании', decidedAt: new Date() } })
    if (requester.email) await sendMail({ to: requester.email, subject: 'Заявка отклонена', text: 'К сожалению, в компании достигнут лимит логопедов.' })
    revalidatePath('/logoped/organization/memberships')
    return
  }
  // ensure requester is free
  if (requester.branchId) throw new Error('Пользователь уже состоит в организации')
  // approve and attach to Main Office
  await prisma.$transaction([
    prisma.organizationMembershipRequest.update({ where: { id: req.id }, data: { status: 'APPROVED', decidedAt: new Date(), targetCompanyId: company.id } }),
    prisma.user.update({ where: { id: requester.id }, data: { branchId: main.id } }),
  ])
  if (requester.email) await sendMail({ to: requester.email, subject: 'Заявка одобрена', text: `Ваша заявка одобрена. Вы добавлены в «Основной офис» компании.` })
  revalidatePath('/logoped/organization/memberships')
  revalidatePath('/settings/organization/memberships')
  redirect('/settings/organization/memberships?done=approved')
}
