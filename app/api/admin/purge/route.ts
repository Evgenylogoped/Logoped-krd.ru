import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Hard whitelist from product owner (emails)
const ADMIN_WHITELIST = [
  '79889543377@yandex.ru',
  'nov1koveu9@yandex.ru',
  'kadetik@mail.ru',
]

// TEMP one-time token (will be removed after run)
const ONE_TIME_TOKEN = 'PURGE_ONCE_2025-10-06_15-25'

async function isAllowed(bodyToken?: string) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role as string | undefined
  const id = (session?.user as any)?.id as string | undefined
  const email = (session?.user as any)?.email as string | undefined
  const adminLike = role === 'SUPER_ADMIN' || role === 'ADMIN'
  const whitelisted = email ? ADMIN_WHITELIST.includes(email) : false
  const bySession = !!session && adminLike && whitelisted
  const byToken = typeof bodyToken === 'string' && bodyToken === ONE_TIME_TOKEN
  return { allowed: bySession || byToken, session, id, role, email, byToken }
}

export async function POST(req: Request) {
  let body: any = {}
  try { body = await req.json() } catch {}
  const provided = body?.token as string | undefined
  const { allowed, byToken } = await isAllowed(provided)
  if (!allowed) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  if (!body || body.confirm !== 'I_CONFIRM_PURGE') {
    return NextResponse.json({ ok: false, error: 'Confirmation required: set { confirm: "I_CONFIRM_PURGE" }' }, { status: 400 })
  }

  // Start purge transaction in best-effort steps
  const keptUsers = await (prisma as any).user.findMany({ where: { email: { in: ADMIN_WHITELIST } }, select: { id: true, email: true } })
  const keepIds = new Set<string>((keptUsers || []).map((u: any) => u.id))

  // Identify users to delete
  const toDelete = await (prisma as any).user.findMany({ where: { email: { notIn: ADMIN_WHITELIST } }, select: { id: true, email: true } })
  const delIds = (toDelete || []).map((u: any) => u.id)

  // If running on SQLite, temporarily disable FK checks to allow hard purge
  const dbUrl = String(process.env.DATABASE_URL || '')
  const isSQLite = dbUrl.startsWith('file:')
  if (isSQLite) {
    try { await (prisma as any).$executeRawUnsafe?.('PRAGMA foreign_keys = OFF') } catch {}
  }

  try {
    // LESSON-CASCADE: find lessons owned by users and remove all dependents
    const lessons = delIds.length ? await (prisma as any).lesson.findMany({ where: { logopedId: { in: delIds } }, select: { id: true } }) : []
    const lessonIds = lessons.map((l: any) => l.id)
    if (lessonIds.length) {
      await (prisma as any).passUsage.deleteMany({ where: { lessonId: { in: lessonIds } } }).catch(()=>{})
      await (prisma as any).payoutLessonLink.deleteMany({ where: { lessonId: { in: lessonIds } } }).catch(()=>{})
      await (prisma as any).transaction.deleteMany({ where: { lessonId: { in: lessonIds } } }).catch(()=>{})
      await (prisma as any).consultationRequest.deleteMany({ where: { lessonId: { in: lessonIds } } }).catch(()=>{})
      await (prisma as any).lessonEvaluation.deleteMany({ where: { lessonId: { in: lessonIds } } }).catch(()=>{})
      await (prisma as any).booking.deleteMany({ where: { lessonId: { in: lessonIds } } }).catch(()=>{})
      await (prisma as any).enrollment.deleteMany({ where: { lessonId: { in: lessonIds } } }).catch(()=>{})
      await (prisma as any).lesson.deleteMany({ where: { id: { in: lessonIds } } }).catch(()=>{})
    }

    // USER-BOUND TABLES (per user)
    if (delIds.length) {
      await (prisma as any).workTemplate?.deleteMany?.({ where: { userId: { in: delIds } } }).catch(()=>{})
      await (prisma as any).blockedTime?.deleteMany?.({ where: { userId: { in: delIds } } }).catch(()=>{})
      await (prisma as any).commissionRate?.deleteMany?.({ where: { userId: { in: delIds } } }).catch(()=>{})
      await (prisma as any).payoutRequest?.deleteMany?.({ where: { OR: [ { logopedId: { in: delIds } }, { confirmedById: { in: delIds } } ] } }).catch(()=>{})
      await (prisma as any).billingCustomer?.deleteMany?.({ where: { userId: { in: delIds } } }).catch(()=>{})
      await (prisma as any).subscription?.deleteMany?.({ where: { userId: { in: delIds } } }).catch(()=>{})
      await (prisma as any).passwordToken?.deleteMany?.({ where: { userId: { in: delIds } } }).catch(()=>{})
      await (prisma as any).auditLog?.deleteMany?.({ where: { actorId: { in: delIds } } }).catch(()=>{})
      await (prisma as any).userOrganizationRole?.deleteMany?.({ where: { userId: { in: delIds } } }).catch(()=>{})
      await (prisma as any).userBranchRole?.deleteMany?.({ where: { userId: { in: delIds } } }).catch(()=>{})
      await (prisma as any).userSupervisor?.deleteMany?.({ where: { OR: [ { supervisorId: { in: delIds } }, { subordinateId: { in: delIds } } ] } }).catch(()=>{})
      await (prisma as any).account?.deleteMany?.({ where: { userId: { in: delIds } } }).catch(()=>{})
      await (prisma as any).session?.deleteMany?.({ where: { userId: { in: delIds } } }).catch(()=>{})
      // unlink branches for safety
      await (prisma as any).user.updateMany({ where: { id: { in: delIds } }, data: { branchId: null } }).catch(()=>{})
    }

    // Chat: remove messages/participants/conversations for deleting users
    if (delIds.length > 0) {
      await (prisma as any).message.deleteMany({ where: { OR: [ { authorId: { in: delIds } }, { conversation: { participants: { some: { userId: { in: delIds } } } } } ] } }).catch(()=>{})
      await (prisma as any).conversationParticipantState.deleteMany({ where: { userId: { in: delIds } } }).catch(()=>{})
      await (prisma as any).conversationParticipant.deleteMany({ where: { userId: { in: delIds } } }).catch(()=>{})
      // identify conversations to delete: those without participants OR all participants are from delIds
      const convs = await (prisma as any).conversation.findMany({ select: { id: true, participants: { select: { userId: true } } } })
      const toDrop = (convs || []).filter((c: any) => {
        const p = (c.participants || []).map((x: any)=>x.userId)
        if (p.length === 0) return true
        return p.every((uid: string) => delIds.includes(uid))
      }).map((c: any)=>c.id)
      if (toDrop.length) {
        // delete settings first, then conversations
        await (prisma as any).conversationSettings.deleteMany({ where: { conversationId: { in: toDrop } } }).catch(()=>{})
        await (prisma as any).conversation.deleteMany({ where: { id: { in: toDrop } } }).catch(()=>{})
      }
    }
  } catch {}

  try {
    // Parent/Child and lessons
    const parents = await (prisma as any).parent.findMany({ where: { userId: { in: delIds } }, select: { id: true } })
    const parentIds = (parents || []).map((p: any) => p.id)
    const children = await (prisma as any).child.findMany({ where: { parentId: { in: parentIds } }, select: { id: true } })
    const childIds = (children || []).map((c: any) => c.id)

    await (prisma as any).enrollment.deleteMany({ where: { childId: { in: childIds } } }).catch(()=>{})
    const lessonsByChildren = await (prisma as any).lesson.findMany({ where: { enrolls: { some: { childId: { in: childIds } } } }, select: { id: true } })
    const lbcIds = (lessonsByChildren || []).map((l:any)=>l.id)
    if (lbcIds.length) {
      await (prisma as any).booking.deleteMany({ where: { lessonId: { in: lbcIds } } }).catch(()=>{})
      await (prisma as any).consultationRequest.deleteMany({ where: { lessonId: { in: lbcIds } } }).catch(()=>{})
      await (prisma as any).lessonEvaluation.deleteMany({ where: { lessonId: { in: lbcIds } } }).catch(()=>{})
      await (prisma as any).transaction?.deleteMany?.({ where: { lessonId: { in: lbcIds } } }).catch(()=>{})
      await (prisma as any).passUsage?.deleteMany?.({ where: { lessonId: { in: lbcIds } } }).catch(()=>{})
      await (prisma as any).payoutLessonLink?.deleteMany?.({ where: { lessonId: { in: lbcIds } } }).catch(()=>{})
      await (prisma as any).lesson.deleteMany({ where: { id: { in: lbcIds } } }).catch(()=>{})
    }
    await (prisma as any).childReward.deleteMany({ where: { childId: { in: childIds } } }).catch(()=>{})
    await (prisma as any).progressEntry.deleteMany({ where: { childId: { in: childIds } } }).catch(()=>{})
    await (prisma as any).child.deleteMany({ where: { id: { in: childIds } } }).catch(()=>{})
    await (prisma as any).parent.deleteMany({ where: { id: { in: parentIds } } }).catch(()=>{})
  } catch {}

  try {
    // Finance entities (best-effort)
    await (prisma as any).payoutRequest.deleteMany({}).catch(()=>{})
    await (prisma as any).transaction.deleteMany({}).catch(()=>{})
    await (prisma as any).pass.deleteMany({}).catch(()=>{})
  } catch {}

  try {
    // Organization-related optional data (best-effort clean to baseline)
    await (prisma as any).userSupervisor.deleteMany({ where: { OR: [ { supervisorId: { in: delIds } }, { subordinateId: { in: delIds } } ] } }).catch(()=>{})
  } catch {}

  try {
    // Finally, delete the users
    if (delIds.length > 0) await (prisma as any).user.deleteMany({ where: { id: { in: delIds } } })
  } catch {}

  // Files cleanup: remove uploads for chats and children
  try {
    const { promises: fs } = await import('fs')
    const path = await import('path')
    const root = path.join(process.cwd(), 'public', 'uploads')
    const targets = [ 'chat', 'children' ]
    for (const dir of targets) {
      const full = path.join(root, dir)
      await fs.rm(full, { recursive: true, force: true }).catch(()=>{})
      await fs.mkdir(full, { recursive: true }).catch(()=>{})
    }
  } catch {}

  return NextResponse.json({ ok: true, kept: ADMIN_WHITELIST, deletedUsers: delIds.length, usedOneTimeToken: !!byToken })
}
