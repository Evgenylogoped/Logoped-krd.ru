"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

function ensureAccountant(session: any) {
  const role = (session?.user as any)?.role
  if (!session?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) throw new Error('Forbidden')
}

export async function updateLogopedBasic(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const userId = String(formData.get('userId') || '')
  if (!userId) return
  const name = String(formData.get('name') || '').trim() || null
  const email = String(formData.get('email') || '').trim() || null
  const city = String(formData.get('city') || '').trim() || null
  const specialization = String(formData.get('specialization') || '').trim() || null
  const profession = String(formData.get('profession') || '').trim() || null
  const about = String(formData.get('about') || '').trim() || null
  const education = String(formData.get('education') || '').trim() || null
  const hideEducationFromParents = String(formData.get('hideEducationFromParents') || '') === 'on'
  const hideAboutFromParents = String(formData.get('hideAboutFromParents') || '') === 'on'
  const address = String(formData.get('address') || '').trim() || null
  const experienceYearsRaw = String(formData.get('experienceYears') || '').trim()
  const lessonPriceRaw = String(formData.get('lessonPrice') || '').trim()
  const showPriceToParents = String(formData.get('showPriceToParents') || '') === 'on'
  const isOnline = String(formData.get('isOnline') || '') === 'on'
  const isOffline = String(formData.get('isOffline') || '') === 'on'
  const scheduleSlotMinutesRaw = String(formData.get('scheduleSlotMinutes') || '').trim()
  const scheduleBreakMinutesRaw = String(formData.get('scheduleBreakMinutes') || '').trim()
  const timeZone = String(formData.get('timeZone') || '').trim() || null
  const preferredScheduleView = String(formData.get('preferredScheduleView') || '').trim() || null
  const notifyByEmail = String(formData.get('notifyByEmail') || '') === 'on'
  const currency = String(formData.get('currency') || '').trim() || null
  const reportPeriod = String(formData.get('reportPeriod') || '').trim() || null
  const activatedForever = String(formData.get('activatedForever') || '') === 'on'
  const activatedUntilRaw = String(formData.get('activatedUntil') || '').trim()
  const experienceYears = experienceYearsRaw ? Number(experienceYearsRaw) : null
  const lessonPrice = lessonPriceRaw ? Number(lessonPriceRaw) : null
  const scheduleSlotMinutes = scheduleSlotMinutesRaw ? Number(scheduleSlotMinutesRaw) : null
  const scheduleBreakMinutes = scheduleBreakMinutesRaw ? Number(scheduleBreakMinutesRaw) : null
  const activatedUntil = activatedUntilRaw ? new Date(activatedUntilRaw) : null
  await prisma.user.update({
    where: { id: userId },
    data: {
      name: name ?? undefined,
      email: email ?? undefined,
      city: city ?? undefined,
      profession: profession ?? undefined,
      specialization: specialization ?? undefined,
      about: about ?? undefined,
      education: education ?? undefined,
      hideEducationFromParents,
      hideAboutFromParents,
      address: address ?? undefined,
      experienceYears: experienceYears ?? undefined,
      lessonPrice: lessonPrice ?? undefined,
      showPriceToParents,
      isOnline,
      isOffline,
      scheduleSlotMinutes: scheduleSlotMinutes ?? undefined,
      scheduleBreakMinutes: scheduleBreakMinutes ?? undefined,
      timeZone: timeZone ?? undefined,
      preferredScheduleView: preferredScheduleView ?? undefined,
      notifyByEmail,
      currency: currency ?? undefined,
      reportPeriod: reportPeriod ?? undefined,
      activatedForever,
      activatedUntil: activatedForever ? null : (activatedUntil ?? undefined),
    } as any,
  })
  try { await (prisma as any).auditLog?.create({ data: { action: 'user.update_basic', payload: JSON.stringify({ userId, name, email, city, profession, specialization, about, education, hideEducationFromParents, hideAboutFromParents, address, experienceYears, lessonPrice, showPriceToParents, isOnline, isOffline, scheduleSlotMinutes, scheduleBreakMinutes, timeZone, preferredScheduleView, notifyByEmail, currency, reportPeriod, activatedForever, activatedUntil }), createdAt: new Date() } }) } catch {}
  revalidatePath('/admin/logopeds')
}

export async function setFeaturedFlags(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const userId = String(formData.get('userId') || '')
  if (!userId) return
  let featuredSuper = String(formData.get('featuredSuper') || '') === 'on'
  let featured = String(formData.get('featured') || '') === 'on'
  // Взаимоисключаемость и дефолт "выключено"
  if (featuredSuper && featured) {
    featuredSuper = true
    featured = false
  } else if (featuredSuper) {
    featured = false
  } else if (featured) {
    featuredSuper = false
  } else {
    featuredSuper = false
    featured = false
  }
  await prisma.user.update({ where: { id: userId }, data: { featuredSuper, featured } as any })
  try { await (prisma as any).auditLog?.create({ data: { action: 'user.set_feature_flags', payload: JSON.stringify({ userId, featuredSuper, featured }), createdAt: new Date() } }) } catch {}
  revalidatePath('/admin/logopeds')
}

async function auditLog(action: string, payload: Record<string, any>) {
  const client: any = prisma as any
  if (!client.auditLog) return
  try { await client.auditLog.create({ data: { action, payload: JSON.stringify(payload), createdAt: new Date() } }) } catch {}
}

async function handleLeadershipOnDelete(userId: string) {
  // Владельцы компаний — переводим компанию в ликвидацию
  const owned = await (prisma as any).company.findMany({ where: { ownerId: userId }, select: { id: true, liquidatedAt: true } })
  for (const c of owned) {
    if (!c.liquidatedAt) {
      await (prisma as any).company.update({ where: { id: c.id }, data: { liquidatedAt: new Date() } })
      await auditLog('company.liquidate_on_owner_delete', { companyId: c.id, ownerId: userId })
    }
  }
  // Руководители филиалов — снимаем managerId, компанию не ликвидируем
  const ledBranches = await (prisma as any).branch.findMany({ where: { managerId: userId }, select: { id: true, companyId: true } })
  for (const b of ledBranches) {
    await (prisma as any).branch.update({ where: { id: b.id }, data: { managerId: null } })
    await auditLog('branch.manager_cleared_on_user_delete', { branchId: b.id, companyId: b.companyId, managerId: userId })
  }
}

export async function deleteLogoped(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const userId = String(formData.get('userId') || '')
  if (!userId) return
  const user = await (prisma as any).user.findUnique({ where: { id: userId } })
  if (!user) return
  if (user.role !== 'LOGOPED') throw new Error('Удалять можно только логопедов')
  await handleLeadershipOnDelete(userId)
  await (prisma as any).user.delete({ where: { id: userId } })
  await auditLog('user.delete', { userId })
  revalidatePath('/admin/logopeds')
}

export async function bulkDeleteLogopeds(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const ids = (formData.getAll('ids') || []).map(v => String(v)).filter(Boolean)
  if (!ids.length) return
  // автоликвидация компаний для каждого удаляемого логопеда, если он владелец/руководитель
  for (const id of ids) await handleLeadershipOnDelete(id)
  await (prisma as any).user.deleteMany({ where: { id: { in: ids }, role: 'LOGOPED' } })
  await auditLog('user.bulk_delete', { ids })
  revalidatePath('/admin/logopeds')
}

export async function bulkActivateLogopeds(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const ids = (formData.getAll('ids') || []).map(v => String(v)).filter(Boolean)
  const months = Number(String(formData.get('months') || '0'))
  if (!ids.length || !months || months <= 0) return
  const now = new Date()
  const until = new Date(now)
  until.setMonth(until.getMonth() + months)
  await (prisma as any).user.updateMany({ where: { id: { in: ids }, role: 'LOGOPED' }, data: { activatedUntil: until, activatedForever: false } })
  await auditLog('user.bulk_activate_months', { ids, months, until })
  revalidatePath('/admin/logopeds')
}

export async function bulkActivateForever(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const ids = (formData.getAll('ids') || []).map(v => String(v)).filter(Boolean)
  if (!ids.length) return
  await (prisma as any).user.updateMany({ where: { id: { in: ids }, role: 'LOGOPED' }, data: { activatedForever: true, activatedUntil: null } })
  await auditLog('user.bulk_activate_forever', { ids })
  revalidatePath('/admin/logopeds')
}

export async function bulkDeactivateLogopeds(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const ids = (formData.getAll('ids') || []).map(v => String(v)).filter(Boolean)
  if (!ids.length) return
  await (prisma as any).user.updateMany({ where: { id: { in: ids }, role: 'LOGOPED' }, data: { activatedForever: false, activatedUntil: null } })
  await auditLog('user.bulk_deactivate', { ids })
  revalidatePath('/admin/logopeds')
}
