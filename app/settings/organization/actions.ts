"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { getUserPlan, getLimits, getUserLimits } from '@/lib/subscriptions'
import { redirect } from 'next/navigation'

function assert(condition: any, message: string) {
  if (!condition) throw new Error(message)
}

export async function removeLogopedFromCompany(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const actor = await prisma.user.findUnique({ where: { id: (session.user as any).id }, include: { branch: { include: { company: true } } } }) as any
  if (!actor?.branch?.companyId) throw new Error('У вас нет компании')
  const userId = String(formData.get('userId') || '')
  if (!userId) throw new Error('Нет userId')
  const target = await prisma.user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } }) as any
  if (!target?.branch?.companyId || target.branch.companyId !== actor.branch.companyId) throw new Error('Пользователь не в вашей компании')
  // права: владелец компании или менеджер филиала той же компании
  const isOwner = actor?.branch?.company?.ownerId === actor.id
  const isBranchManager = actor?.branchId && actor?.branch?.managerId === actor.id
  if (!isOwner && !isBranchManager) throw new Error('Недостаточно прав')
  // нельзя удалить владельца
  if (target?.branch?.company?.ownerId === target.id) throw new Error('Нельзя удалить владельца компании')
  // Проверка незакрытых организационных начислений
  const raw = await (prisma as any).lesson.findMany({
    where: { logopedId: target.id, settledAt: { not: null, lt: new Date() }, payoutStatus: 'NONE' },
    include: { transactions: true },
    take: 2000,
  })
  const unsettled = (raw as any[]).filter(L => (L.transactions||[]).some((t:any)=> t?.meta?.personal !== true)).length
  if (unsettled > 0) throw new Error('Нельзя удалить: у логопеда есть незакрытые организационные начисления')
  await prisma.user.update({ where: { id: target.id }, data: { branchId: null } })
  revalidatePath('/settings/organization')
  revalidatePath('/settings/organization/members')
  revalidatePath('/settings/organization/memberships')
  revalidatePath('/logoped/organization/membership')
  redirect('/settings/organization?saved=1')
}

async function getMeWithOrg() {
  const session = await getServerSession(authOptions)
  assert(session?.user, 'Unauthorized')
  const me = await prisma.user.findUnique({
    where: { id: (session!.user as any).id as string },
    include: { branch: { include: { company: true } } },
  })
  assert(me, 'User not found')
  return me!
}

  function isOwner(me: any) {
    return Boolean(me?.branch?.company?.ownerId === me?.id)
  }

  function ensureOwner(me: any) {
    assert(isOwner(me), 'Доступ только для владельца компании')
  }

  async function ensureMainOffice(companyId: string) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, include: { owner: true, branches: true } }) as any
    assert(company, 'Компания не найдена')
    let main = (company.branches || []).find((b: any) => (b.name || '').toLowerCase() === 'основной офис')
    if (!main) {
      main = await prisma.branch.create({ data: { companyId, name: 'Основной офис', managerId: company.ownerId || undefined } as any })
    } else if (!main.managerId && company.ownerId) {
      await prisma.branch.update({ where: { id: main.id }, data: { managerId: company.ownerId } })
    }
    if (company.ownerId) {
      const owner = await prisma.user.findUnique({ where: { id: company.ownerId } })
      if (owner && owner.branchId !== main.id) {
        await prisma.user.update({ where: { id: owner.id }, data: { branchId: main.id } })
      }
    }
    return main as any
  }

async function ensureSameCompany(userId: string, companyId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, include: { branch: true } })
  if (!u) throw new Error('Пользователь не найден')
  const b = u.branchId ? await prisma.branch.findUnique({ where: { id: u.branchId } }) : null
  if (u.branchId && b?.companyId !== companyId) throw new Error('Можно перемещать только в пределах одной компании')
}

  export async function createBranch(formData: FormData) {
    const me = await getMeWithOrg()
    ensureOwner(me)
    const rawName = String(formData.get('name') || '').trim()
    const address = String(formData.get('address') || '').trim() || null
    const companyId = me.branch!.companyId
    await ensureMainOffice(companyId)
    const company = await prisma.company.findUnique({ where: { id: companyId }, include: { branches: true } }) as any
    assert(company, 'Компания не найдена')
    // allowedBranches трактуем как количество дополнительных филиалов, без учёта «Основного офиса»
    const nonMain = (company.branches || []).filter((b: any) => (b.name || '').toLowerCase() !== 'основной офис')
    // Soft‑квота: админы/суперадмины/бухгалтеры не ограничены
    const session = await getServerSession(authOptions)
    const actorRole = (session?.user as any)?.role as string | undefined
    const isAdminish = !!actorRole && ['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(actorRole)
    // Вычисляем лимит: если в компании не задан, берём из плана владельца
    let allowedBranches = Number(company.allowedBranches || 0)
    try {
      if (!allowedBranches && company.ownerId) {
        const plan = await getUserPlan(company.ownerId)
        const lim = await getUserLimits(company.ownerId, plan)
        allowedBranches = Number(lim.branches || 0)
      }
    } catch {}
    if (!isAdminish && allowedBranches > 0 && nonMain.length >= allowedBranches) {
      try { await (prisma as any).auditLog.create({ data: { action: 'PLAN_LIMIT_BLOCK', payload: JSON.stringify({ kind: 'branches', companyId, ownerId: company.ownerId || null, current: nonMain.length, allowed: allowedBranches }) } }) } catch {}
      // мягко перенаправляем на биллинг, вместо исключения
      revalidatePath('/settings/organization')
      redirect('/settings/billing?quota=branches')
    }
    // автонумерация
    const nextIndex = nonMain.length + 1
    const name = rawName || `Филиал №${nextIndex}`
    await prisma.branch.create({ data: { companyId, name, address: address || undefined } as any })
    revalidatePath('/settings/organization')
    redirect('/settings/organization?saved=1')
  }

  export async function assignBranchManager(formData: FormData) {
    const me = await getMeWithOrg()
    ensureOwner(me)
    const branchId = String(formData.get('branchId') || '')
    const managerId = String(formData.get('managerId') || '')
  assert(branchId, 'Укажите филиал')
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, include: { company: true, users: true } }) as any
  assert(branch && branch.companyId === me.branch!.companyId, 'Можно назначать только в своей компании')
  if (managerId) {
    assert(branch.users.some((u: any) => u.id === managerId), 'Руководитель должен состоять в филиале')
    await prisma.branch.update({ where: { id: branchId }, data: { managerId } })
  } else {
    // снять руководителя
    await prisma.branch.update({ where: { id: branchId }, data: { managerId: null } as any })
  }
  revalidatePath('/settings/organization')
  redirect('/settings/organization?saved=1')
}

  export async function moveLogoped(formData: FormData) {
  const me = await getMeWithOrg()
  ensureOwner(me)
  const userId = String(formData.get('userId') || '')
  const toBranchId = String(formData.get('toBranchId') || '')
  assert(userId, 'Нет userId')
  const companyId = me.branch!.companyId
  await ensureSameCompany(userId, companyId)
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } }) as any
  assert(user, 'Пользователь не найден')
  // если переводим логопеда из "без филиала" в филиал, проверить лимит (повторно на случай правок выше)
  if (toBranchId && !user.branchId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, include: { branches: { select: { id: true } }, owner: { select: { id: true } } } }) as any
    const currentLogopeds = await prisma.user.count({ where: { role: 'LOGOPED', branch: { companyId } } })
    const session = await getServerSession(authOptions)
    const actorRole = (session?.user as any)?.role as string | undefined
    const isAdminish = !!actorRole && ['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(actorRole)
    // Лимит: если в компании не задан, берём из плана владельца
    let allowed = Number(company.allowedLogopeds || 0)
    if (!allowed && company.owner?.id) {
      const plan = await getUserPlan(company.owner.id)
      const limits = await getUserLimits(company.owner.id, plan)
      allowed = Number(limits.logopeds || 0)
    }
    if (!isAdminish && allowed > 0 && currentLogopeds >= allowed) {
      revalidatePath('/settings/organization')
      redirect('/settings/billing?quota=logopeds')
    }
  }
  // запоминаем прежнюю компанию (если есть)
  const prevCompanyId = user.branch?.company?.id as string | undefined
  await prisma.user.update({ where: { id: userId }, data: { branchId: toBranchId || null } as any })
  // Если логопеда вывели из компании (toBranchId пустой) — проверить, не осталась ли компания без логопедов
  if (!toBranchId && prevCompanyId) {
    const remaining = await prisma.user.count({ where: { role: 'LOGOPED', branch: { companyId: prevCompanyId } } as any })
    if (remaining === 0) {
      // если компания не в ликвидации — отметить и сразу удалить; если уже ликвидируется — сразу удалить
      const comp = await prisma.company.findUnique({ where: { id: prevCompanyId } }) as any
      if (!comp) {
        // nothing
      } else {
        await prisma.$transaction(async (tx) => {
          if (!comp.liquidatedAt) {
            await tx.company.update({ where: { id: prevCompanyId }, data: { liquidatedAt: new Date() } as any })
          }
          // отвязать всех пользователей компании (включая админов/владельца)
          const branches = await tx.branch.findMany({ where: { companyId: prevCompanyId }, select: { id: true } })
          const branchIds = branches.map(b => b.id)
          if (branchIds.length) {
            await tx.user.updateMany({ where: { branchId: { in: branchIds } } as any, data: { branchId: null, orgGraceUntil: null } as any })
          }
          await tx.branch.deleteMany({ where: { companyId: prevCompanyId } })
          await tx.company.delete({ where: { id: prevCompanyId } })
        })
      }
    }
  }
  revalidatePath('/settings/organization')
  redirect('/settings/organization?saved=1')
}

  export async function inviteLogopedToCompany(formData: FormData) {
  const me = await getMeWithOrg()
  const email = String(formData.get('email') || '').toLowerCase().trim()
  assert(email, 'Введите e-mail логопеда')
  // Разрешить владельцу или руководителю филиала приглашать
  const can = isOwner(me) || Boolean(me.branch?.managerId === me.id)
  assert(can, 'Нет прав на приглашение')
  await ensureMainOffice(me.branch!.companyId)
  // Найти логопеда по email
  const target = await prisma.user.findUnique({ where: { email } }).catch(()=>null)
  if (!target) {
    // Пользователь не найден — отправим письмо-приглашение
    try {
      const { sendMail } = await import("@/lib/mail")
      await sendMail({ to: email, subject: 'Приглашение в организацию', text: `Вас приглашают в организацию. Зарегистрируйтесь на сайте и примите приглашение.` })
    } catch {}
    revalidatePath('/settings/organization')
    redirect('/settings/organization?saved=1')
  }
  if (target.role !== 'LOGOPED') throw new Error('Можно приглашать только логопеда')
  if (target.branchId) throw new Error('Пользователь уже состоит в организации')
  const pending = await prisma.organizationMembershipRequest.findFirst({ where: { requesterId: target.id, status: 'PENDING' } })
  if (pending) throw new Error('У пользователя уже есть заявка в ожидании')
  // Помечаем reason='INVITE' чтобы логопед мог подтвердить приглашение со своей стороны
  await prisma.organizationMembershipRequest.create({ data: { requesterId: target.id, leaderEmail: String((me as any).email || '').toLowerCase(), reason: 'INVITE' } as any })
  revalidatePath('/settings/organization')
  redirect('/settings/organization?saved=1')
}
