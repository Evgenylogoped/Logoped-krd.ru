"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

// Выравнивает связи для уроков/транзакций в контуре текущего руководителя (владелец основного офиса или руководитель филиала)
export async function backfillLeaderLinks(): Promise<void> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const userId = (session?.user as any)?.id
  if (!session) throw new Error('Forbidden')
  // Разрешаем: ADMIN/SUPER_ADMIN/ACCOUNTANT, а также LOGOPED если он владелец компании или руководитель филиала
  let allowed = ['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)
  if (!allowed && role === 'LOGOPED') {
    const meGuard = await (prisma as any).user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } })
    const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: userId }, select: { id: true } })
    const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: userId }, select: { id: true } })
    const isOwnerGuard = Boolean(meGuard?.branch?.company?.ownerId === userId) || Boolean(ownedCompany)
    const isBranchManagerGuard = Boolean(meGuard?.branch?.managerId === userId) || Boolean(managesAny)
    allowed = isOwnerGuard || isBranchManagerGuard
  }
  if (!allowed) throw new Error('Forbidden')

  try {
    // Определяем контур: владелец компании (основной офис) или руководитель филиала; бухгалтер — пропускаем фильтр (всё)
    const me = await (prisma as any).user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } })
    const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: userId }, select: { id: true } })
    const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: userId }, select: { id: true } })
    const isOwner = Boolean(me?.branch?.company?.ownerId === userId) || Boolean(ownedCompany)
    const isBranchManager = Boolean(me?.branch?.managerId === userId) || Boolean(managesAny)

    const userFilter: any = {}
    if (role === 'ACCOUNTANT') {
      // бухгалтер — все
    } else if (isOwner && me?.branchId) {
      userFilter.branchId = me.branchId
    } else if (isBranchManager && me?.branchId) {
      userFilter.branchId = me.branchId
    } else {
      // если ни владелец, ни руководитель — ограничиваем пустым
      userFilter.id = '__none__'
    }

    // Все логопеды в контуре
    const therapists = await (prisma as any).user.findMany({ where: { role: 'LOGOPED', ...(userFilter.branchId ? { branchId: userFilter.branchId } : {}) }, select: { id: true, branchId: true } })
    const logopedIds = therapists.map((u: any) => u.id)

    // Уроки логопедов: если group.branchId не совпадает с user.branchId — переносим в группу филиала логопеда
    let lessonsRebound = 0
    for (const t of therapists as any[]) {
      if (!t.branchId) continue
      let group = await (prisma as any).group.findFirst({ where: { branchId: t.branchId } })
      if (!group) group = await (prisma as any).group.create({ data: { name: 'General', branchId: t.branchId } })
      const res = await (prisma as any).lesson.updateMany({ where: { logopedId: t.id, group: { branchId: { not: t.branchId } } }, data: { groupId: group.id } })
      lessonsRebound += (res as any).count || 0
    }

    // Проставляем branchId/companyId у транзакций по связям через lesson -> group -> branch
    const lessons = await (prisma as any).lesson.findMany({ where: { logopedId: { in: logopedIds } }, include: { group: { include: { branch: true } } } })
    const lessonBranchMap = new Map<string, { branchId: string, companyId: string }>()
    for (const L of lessons as any[]) {
      if (L?.group?.branch) lessonBranchMap.set(L.id, { branchId: L.group.branchId, companyId: L.group.branch.companyId })
    }

    // Проставляем на транзакциях, где пусто
    const lessonIds = Array.from(lessonBranchMap.keys())
    let txFixed = 0
    if (lessonIds.length > 0) {
      const txToFix = await (prisma as any).transaction.findMany({ where: { lessonId: { in: lessonIds }, OR: [{ branchId: null }, { companyId: null }] }, select: { id: true, lessonId: true } })
      for (const tx of txToFix as any[]) {
        const info = lessonBranchMap.get(tx.lessonId)
        if (!info) continue
        await (prisma as any).transaction.update({ where: { id: tx.id }, data: { branchId: info.branchId, companyId: info.companyId } })
        txFixed++
      }
    }

    revalidatePath('/admin/finance/dashboard')
    redirect(`/admin/finance/dashboard?backfilled=1&lessons=${lessonsRebound}&tx=${txFixed}`)
  } catch (e: any) {
    const msg = (e?.message || 'error').slice(0, 200)
    revalidatePath('/admin/finance/dashboard')
    redirect(`/admin/finance/dashboard?backfillError=1&msg=${encodeURIComponent(msg)}`)
  }
}

// Переносит транзакции текущего контура в архив (устанавливает archivedAt=now) за указанный период [start,end]
export async function archiveScopeTransactions(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const userId = (session?.user as any)?.id
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) throw new Error('Forbidden')

  const startStr = String(formData.get('start') || '')
  const endStr = String(formData.get('end') || '')
  if (!startStr || !endStr) throw new Error('Bad period')
  const start = new Date(startStr)
  const end = new Date(endStr)

  const me = await (prisma as any).user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } })
  const isOwner = Boolean(me?.branch?.company?.ownerId === userId)
  const isBranchManager = Boolean(me?.branch?.managerId === userId)
  const branchScopeId = (role === 'ACCOUNTANT') ? undefined : (isOwner || isBranchManager) ? me?.branchId : undefined

  const where: any = { archivedAt: null, createdAt: { gte: start, lte: end } }
  if (branchScopeId) where.branchId = branchScopeId

  const res = await (prisma as any).transaction.updateMany({ where, data: { archivedAt: new Date() } })
  revalidatePath('/admin/finance/dashboard')
  redirect(`/admin/finance/dashboard?archived=1&count=${res.count||0}`)
}

// Удаляет архивные транзакции старше 6 месяцев (безвозвратно)
export async function purgeOldArchives(): Promise<void> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) throw new Error('Forbidden')
  const sixMonthsAgo = new Date(); sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const res = await (prisma as any).transaction.deleteMany({ where: { archivedAt: { lt: sixMonthsAgo } } })
  revalidatePath('/admin/finance/dashboard')
  redirect(`/admin/finance/dashboard?purged=1&count=${res.count||0}`)
}
