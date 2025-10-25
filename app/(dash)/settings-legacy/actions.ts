"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function updateUserSettings(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const userId = (session.user as any).id as string
  const preferredScheduleView = String(formData.get('preferredScheduleView') || '').trim() || null
  const timeZone = String(formData.get('timeZone') || '').trim() || null
  const notifyByEmail = String(formData.get('notifyByEmail') || '') === 'on'
  const currency = String(formData.get('currency') || '').trim() || null
  const reportPeriod = String(formData.get('reportPeriod') || '').trim() || null
  await prisma.user.update({
    where: { id: userId },
    data: {
      preferredScheduleView: preferredScheduleView || undefined,
      timeZone: timeZone || undefined,
      notifyByEmail,
      currency: currency || undefined,
      reportPeriod: reportPeriod || undefined,
    } as any,
  })
  revalidatePath('/settings')
}

export async function addSubordinate(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const supervisorId = (session.user as any).id as string
  const subordinateId = String(formData.get('subordinateId') || '')
  if (!subordinateId || subordinateId === supervisorId) return
  await (prisma as any).userSupervisor.upsert({
    where: { supervisorId_subordinateId: { supervisorId, subordinateId } },
    create: { supervisorId, subordinateId },
    update: {},
  })
  revalidatePath('/settings')
}

export async function removeSubordinate(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const supervisorId = (session.user as any).id as string
  const subordinateId = String(formData.get('subordinateId') || '')
  if (!subordinateId || subordinateId === supervisorId) return
  await (prisma as any).userSupervisor.delete({ where: { supervisorId_subordinateId: { supervisorId, subordinateId } } }).catch(()=>{})
  revalidatePath('/settings')
}

export async function addSupervisor(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const subordinateId = (session.user as any).id as string
  const supervisorId = String(formData.get('supervisorId') || '')
  if (!supervisorId || supervisorId === subordinateId) return
  await (prisma as any).userSupervisor.upsert({
    where: { supervisorId_subordinateId: { supervisorId, subordinateId } },
    create: { supervisorId, subordinateId },
    update: {},
  })
  revalidatePath('/settings')
}

export async function removeSupervisor(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const subordinateId = (session.user as any).id as string
  const supervisorId = String(formData.get('supervisorId') || '')
  if (!supervisorId || supervisorId === subordinateId) return
  await (prisma as any).userSupervisor.delete({ where: { supervisorId_subordinateId: { supervisorId, subordinateId } } }).catch(()=>{})
  revalidatePath('/settings')
}
