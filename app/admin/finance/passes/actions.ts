"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPass(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session) { redirect('/admin/finance/children?err=forbidden') }
  const childId = String(formData.get('childId') || '')
  const logopedId = String(formData.get('logopedId') || '') || undefined
  const totalLessons = Number(formData.get('totalLessons') || '0')
  let totalPrice = Number(formData.get('totalPrice') || '0')
  const validUntilStr = String(formData.get('validUntil') || '')
  const validUntil = validUntilStr ? new Date(validUntilStr) : null

  if (!childId || totalLessons <= 0) { redirect('/admin/finance/children?err=bad_input') }

  // Scope checks:
  // - ACCOUNTANT: все дети
  // - ADMIN/SUPER_ADMIN/leader: в рамках филиала
  // - LOGOPED: только свои дети
  const me = await (prisma as any).user.findUnique({ where: { id: (session!.user as any).id }, include: { branch: { include: { company: true } } } })
  const child = await (prisma as any).child.findUnique({ where: { id: childId }, include: { logoped: { include: { branch: { include: { company: true } } } } } })
  if (!child) { redirect('/admin/finance/children?err=bad_input') }
  if (role === 'ACCOUNTANT') {
    // без ограничений
  } else {
    // Проверяем лидерство независимо от роли: владелец компании или менеджер филиала
    const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: (session!.user as any).id }, select: { id: true } })
    const managesBranch = await (prisma as any).branch.findFirst({ where: { managerId: (session!.user as any).id }, select: { id: true } })
    const isLeader = Boolean(ownedCompany) || Boolean(managesBranch)
    if (isLeader) {
      const childBranch = (child as any)?.logoped?.branch
      const childCompanyId = childBranch?.companyId
      const childBranchManagerId = childBranch?.managerId
      const isOwnerScope = Boolean(ownedCompany) && !!childCompanyId && (ownedCompany.id === childCompanyId)
      const isManagerScope = Boolean(managesBranch) && !!childBranchManagerId && (childBranchManagerId === (session!.user as any).id)
      if (!isOwnerScope && !isManagerScope) { redirect('/admin/finance/children?err=forbidden_scope') }
    } else {
      // обычный логопед — только свои дети
      if (child.logopedId !== (session!.user as any).id) { redirect('/admin/finance/children?err=forbidden') }
    }
  }
  // Автосумма при отсутствии или некорректной сумме: берём цену урока ребёнка/логопеда
  const unit = (child as any)?.rateLesson != null ? Number((child as any).rateLesson) : Number((child as any)?.logoped?.lessonPrice || 0)
  if (!(totalPrice > 0)) totalPrice = Math.max(0, unit) * totalLessons

  await (prisma as any).pass.create({
    data: {
      childId,
      logopedId: logopedId || null,
      totalLessons,
      remainingLessons: totalLessons,
      totalPrice,
      validUntil,
      status: 'ACTIVE',
    }
  })
  revalidatePath('/admin/finance/passes')
  redirect('/admin/finance/children?ok=1')
}

export async function cancelZeroRemainingPasses(): Promise<void> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const userId = (session?.user as any)?.id
  if (!session) { redirect('/admin/finance/passes?err=forbidden') }

  // Скоуп: бухгалтер — все; руководитель/владелец — свой филиал
  let where: any = { status: 'ACTIVE', remainingLessons: 0 }
  if (role !== 'ACCOUNTANT') {
    const me = await (prisma as any).user.findUnique({ where: { id: userId }, select: { branchId: true } })
    if (!me?.branchId) { redirect('/admin/finance/passes?err=forbidden_scope') }
    where.child = { logoped: { branchId: me.branchId } }
  }

  const res = await (prisma as any).pass.updateMany({ where, data: { status: 'CANCELLED' } })
  revalidatePath('/admin/finance/passes')
  revalidatePath('/admin/finance/dashboard')
  redirect(`/admin/finance/passes?fixed=${Number(res?.count||0)}`)
}

export async function increasePass(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) { redirect('/admin/finance/passes?err=forbidden') }

  const passId = String(formData.get('passId') || '')
  const addLessons = Number(formData.get('addLessons') || '0')
  if (!passId || addLessons <= 0) { redirect('/admin/finance/passes?err=bad_input') }

  const pass = await (prisma as any).pass.findUnique({ where: { id: passId }, include: { child: { include: { logoped: true } } } })
  if (!pass) { redirect('/admin/finance/passes?err=not_found') }

  // В рамках филиала руководителя
  const me = await (prisma as any).user.findUnique({ where: { id: (session!.user as any).id }, include: { branch: { include: { company: true } } } })
  if (role !== 'ACCOUNTANT') {
    const scopeBranchId = me?.branchId
    const childLogopedBranch = (pass as any)?.child?.logoped?.branchId
    if (!scopeBranchId || !childLogopedBranch || scopeBranchId !== childLogopedBranch) { redirect('/admin/finance/passes?err=forbidden_scope') }
  }

  const unit = (pass as any)?.child?.rateLesson != null ? Number((pass as any).child.rateLesson) : Number((pass as any)?.child?.logoped?.lessonPrice || 0)
  const addPrice = Math.max(0, unit) * addLessons

  await (prisma as any).pass.update({
    where: { id: passId },
    data: {
      totalLessons: { increment: addLessons },
      remainingLessons: { increment: addLessons },
      totalPrice: { increment: addPrice },
    }
  })
  revalidatePath('/admin/finance/passes')
  redirect('/admin/finance/passes?ok=1')
}

export async function refundPassRemainder(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session) { redirect('/admin/finance/passes?err=forbidden') }

  const passId = String(formData.get('passId') || '')
  if (!passId) { redirect('/admin/finance/passes?err=bad_input') }

  const pass = await (prisma as any).pass.findUnique({ where: { id: passId }, include: { child: { include: { logoped: true } } } })
  if (!pass) { redirect('/admin/finance/passes?err=not_found') }

  // Права: админ/суперадмин/бух — всегда; иначе владелец компании или менеджер филиала ребёнка
  let allowed = ['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)
  if (!allowed) {
    const me = await (prisma as any).user.findUnique({ where: { id: (session!.user as any).id }, include: { branch: { include: { company: true } } } })
    const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: (session!.user as any).id }, select: { id: true } })
    const managesBranch = await (prisma as any).branch.findFirst({ where: { managerId: (session!.user as any).id }, select: { id: true } })
    const childLogopedBranchId = (pass as any)?.child?.logoped?.branchId
    const ownerScope = ownedCompany && me?.branch?.companyId && (ownedCompany.id === me.branch.companyId)
    const managerScope = managesBranch && childLogopedBranchId && (managesBranch.id === childLogopedBranchId)
    allowed = Boolean(ownerScope) || Boolean(managerScope)
  }
  if (!allowed) { redirect('/admin/finance/passes?err=forbidden') }

  if ((pass as any).status !== 'ACTIVE') {
    revalidatePath('/admin/finance/passes')
    redirect('/admin/finance/passes?ok=1')
  }

  await (prisma as any).pass.update({ where: { id: passId }, data: { status: 'REFUNDED', remainingLessons: 0 } })
  revalidatePath('/admin/finance/passes')
  redirect('/admin/finance/passes?ok=1')
}

export async function closePassIfZero(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const userId = (session?.user as any)?.id
  if (!session) { redirect('/admin/finance/passes?err=forbidden') }

  const passId = String(formData.get('passId') || '')
  if (!passId) { redirect('/admin/finance/passes?err=bad_input') }

  const pass = await (prisma as any).pass.findUnique({ where: { id: passId }, include: { child: { include: { logoped: true } } } })
  if (!pass) { redirect('/admin/finance/passes?err=not_found') }
  if (!((pass as any).status === 'ACTIVE' && Number((pass as any).remainingLessons||0) === 0)) {
    redirect('/admin/finance/passes?err=not_zero')
  }

  // Скоуп проверка: бухгалтер — можно; владелец/менеджер — свой филиал
  if (role !== 'ACCOUNTANT') {
    const me = await (prisma as any).user.findUnique({ where: { id: userId }, select: { branchId: true } })
    const childBranchId = (pass as any)?.child?.logoped?.branchId
    if (!me?.branchId || !childBranchId || me.branchId !== childBranchId) {
      redirect('/admin/finance/passes?err=forbidden_scope')
    }
  }

  await (prisma as any).pass.update({ where: { id: passId }, data: { status: 'CANCELLED' } })
  revalidatePath('/admin/finance/passes')
  revalidatePath('/admin/finance/dashboard')
  redirect('/admin/finance/passes?ok=1')
}
