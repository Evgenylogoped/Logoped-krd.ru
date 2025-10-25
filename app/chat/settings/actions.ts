"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { promises as fs } from 'fs'
import path from 'path'

function ensure(session: any) {
  if (!session?.user) throw new Error('Unauthorized')
}

export async function uploadConversationBackground(formData: FormData) {
  'use server'
  const session = await getServerSession(authOptions)
  ensure(session)
  const convId = String(formData.get('conversationId') || '')
  const file = formData.get('file') as File | null
  if (!convId || !file) return
  const userId = (session!.user as any).id as string
  await ensureAdmin(convId, userId)
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'chat', convId)
  await fs.mkdir(uploadsDir, { recursive: true })
  try { const files = await fs.readdir(uploadsDir); await Promise.all(files.filter(f=> f.startsWith('bg_')).map(f=> fs.unlink(path.join(uploadsDir, f)))) } catch {}
  const buf = Buffer.from(await file.arrayBuffer())
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const mime = (file as any).type as string | undefined
  const ext = mime==='image/webp'?'webp':(mime==='image/png'?'png':'jpg')
  const fname = `bg_${ts}.${ext}`
  await fs.writeFile(path.join(uploadsDir, fname), buf)
  const backgroundUrl = `/uploads/chat/${convId}/${fname}`
  await updateConversationSettings(convId, { backgroundUrl })
  revalidatePath(`/chat/${convId}`)
  revalidatePath(`/chat/${convId}/settings`)
}

export async function uploadConversationIcon(formData: FormData) {
  'use server'
  const session = await getServerSession(authOptions)
  ensure(session)
  const convId = String(formData.get('conversationId') || '')
  const file = formData.get('file') as File | null
  if (!convId || !file) return
  const userId = (session!.user as any).id as string
  await ensureAdmin(convId, userId)
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'chat', convId)
  await fs.mkdir(uploadsDir, { recursive: true })
  try { const files = await fs.readdir(uploadsDir); await Promise.all(files.filter(f=> f.startsWith('icon_')).map(f=> fs.unlink(path.join(uploadsDir, f)))) } catch {}
  const buf = Buffer.from(await file.arrayBuffer())
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const mime = (file as any).type as string | undefined
  const ext = mime==='image/webp'?'webp':(mime==='image/png'?'png':'jpg')
  const fname = `icon_${ts}.${ext}`
  await fs.writeFile(path.join(uploadsDir, fname), buf)
  const iconUrl = `/uploads/chat/${convId}/${fname}`
  await updateConversationSettings(convId, { iconUrl })
  revalidatePath(`/chat/${convId}`)
  revalidatePath(`/chat/${convId}/settings`)
}

async function ensureAdmin(conversationId: string, userId: string) {
  // allow global admin roles regardless of participation
  const me = await (prisma as any).user.findUnique({ where: { id: userId }, select: { role: true } })
  const globalAdmin = me && (me.role === 'ADMIN' || me.role === 'SUPER_ADMIN' || me.role === 'ACCOUNTANT')
  const conv = await (prisma as any).conversation.findUnique({ where: { id: conversationId } })
  const isGroup = conv?.title && String(conv.title).startsWith('group:')
  if (!isGroup) throw new Error('Настройки доступны только для группового чата')
  if (globalAdmin) return
  const part = await (prisma as any).conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId } } })
  if (!part) throw new Error('Нет доступа')
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

export async function updateConversationSettings(conversationId: string, data: { backgroundUrl?: string | null; backgroundColor?: string | null; postingPolicy?: string | null; restrictedMap?: Record<string, boolean> | null; iconUrl?: string | null }) {
  const session = await getServerSession(authOptions)
  ensure(session)
  const userId = (session!.user as any).id as string
  await ensureAdmin(conversationId, userId)
  // read existing settings to merge JSON safely
  const existing = await (prisma as any).conversationSettings.findUnique({ where: { conversationId } })
  const mergedMuted = (data.iconUrl !== undefined)
    ? ({ ...(existing?.mutedUntilJson || {}), iconUrl: data.iconUrl } as any)
    : undefined
  await (prisma as any).conversationSettings.upsert({
    where: { conversationId },
    update: {
      backgroundUrl: data.backgroundUrl ?? undefined,
      backgroundColor: data.backgroundColor ?? undefined,
      postingPolicy: data.postingPolicy ?? undefined,
      restrictedJson: data.restrictedMap ?? undefined,
      mutedUntilJson: mergedMuted,
    },
    create: {
      conversationId,
      backgroundUrl: data.backgroundUrl ?? null,
      backgroundColor: data.backgroundColor ?? null,
      postingPolicy: data.postingPolicy ?? 'ALL',
      restrictedJson: data.restrictedMap ?? null,
      mutedUntilJson: (data.iconUrl !== undefined) ? ({ iconUrl: data.iconUrl } as any) : null,
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
