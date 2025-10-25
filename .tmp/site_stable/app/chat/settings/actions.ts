"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

function ensure(session: any) {
  if (!session?.user) throw new Error('Unauthorized')
}

async function ensureAdmin(conversationId: string, userId: string) {
  const part = await (prisma as any).conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId } } })
  if (!part) throw new Error('Нет доступа')
  const conv = await (prisma as any).conversation.findUnique({ where: { id: conversationId } })
  const isGroup = conv?.title && String(conv.title).startsWith('group:')
  if (!isGroup) throw new Error('Настройки доступны только для группового чата')
  if (!(part.role === 'ADMIN' || part.role === 'LOGOPED')) throw new Error('Недостаточно прав')
}

export async function getConversationSettings(conversationId: string) {
  const session = await getServerSession(authOptions)
  ensure(session)
  const userId = (session!.user as any).id as string
  await ensureAdmin(conversationId, userId)
  const settings = await (prisma as any).conversationSettings.findUnique({ where: { conversationId } })
  const participants = await (prisma as any).conversationParticipant.findMany({ where: { conversationId }, include: { user: true } })
  const states = await (prisma as any).conversationParticipantState.findMany({ where: { conversationId } })
  return { settings, participants, states }
}

export async function updateConversationSettings(conversationId: string, data: { backgroundUrl?: string | null; backgroundColor?: string | null; postingPolicy?: string | null; restrictedMap?: Record<string, boolean> | null; }) {
  const session = await getServerSession(authOptions)
  ensure(session)
  const userId = (session!.user as any).id as string
  await ensureAdmin(conversationId, userId)
  await (prisma as any).conversationSettings.upsert({
    where: { conversationId },
    update: {
      backgroundUrl: data.backgroundUrl ?? undefined,
      backgroundColor: data.backgroundColor ?? undefined,
      postingPolicy: data.postingPolicy ?? undefined,
      restrictedJson: data.restrictedMap ?? undefined,
    },
    create: {
      conversationId,
      backgroundUrl: data.backgroundUrl ?? null,
      backgroundColor: data.backgroundColor ?? null,
      postingPolicy: data.postingPolicy ?? 'ALL',
      restrictedJson: data.restrictedMap ?? null,
    }
  })
  revalidatePath(`/chat/${conversationId}`)
  revalidatePath(`/chat/${conversationId}/settings`)
}

export async function setParticipantState(conversationId: string, targetUserId: string, state: { canPost?: boolean; bannedUntil?: string | null; mutedUntil?: string | null }) {
  const session = await getServerSession(authOptions)
  ensure(session)
  const userId = (session!.user as any).id as string
  await ensureAdmin(conversationId, userId)
  await (prisma as any).conversationParticipantState.upsert({
    where: { conversationId_userId: { conversationId, userId: targetUserId } },
    update: {
      canPost: typeof state.canPost === 'boolean' ? state.canPost : undefined,
      bannedUntil: state.bannedUntil ? new Date(state.bannedUntil) : null,
      mutedUntil: state.mutedUntil ? new Date(state.mutedUntil) : null,
    },
    create: {
      conversationId,
      userId: targetUserId,
      canPost: typeof state.canPost === 'boolean' ? state.canPost : true,
      bannedUntil: state.bannedUntil ? new Date(state.bannedUntil) : null,
      mutedUntil: state.mutedUntil ? new Date(state.mutedUntil) : null,
    }
  })
  revalidatePath(`/chat/${conversationId}`)
  revalidatePath(`/chat/${conversationId}/settings`)
}
