"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function updateNotifications(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const userId = (session.user as any).id as string
  const notifyByEmail = String(formData.get('notifyByEmail') || '') === 'on'
  await prisma.user.update({ where: { id: userId }, data: { notifyByEmail } as any })
  revalidatePath('/settings/notifications')
}
