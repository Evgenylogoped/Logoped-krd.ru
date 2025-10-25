import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureLogopedGroup } from '@/app/chat/chatService'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })
  const role = (session.user as any).role as string
  // Allow even in production environment for local setup
  if (!['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role)) return new NextResponse('Only for logoped/admin', { status: 403 })
  const logopedId = (session.user as any).id as string
  try {
    // ensure logoped user exists (in case of DB reset with stale session)
    const me = await (prisma as any).user.findUnique({ where: { id: logopedId } })
    if (!me) {
      await (prisma as any).user.create({ data: { id: logopedId, email: `restored+${logopedId}@local.test`, passwordHash: 'dev', role: 'LOGOPED', name: 'Логопед' } })
    }
    // ensure demo parent user
    const parentEmail = 'parent@novikovdom.test'
    let parentUser = await (prisma as any).user.findUnique({ where: { email: parentEmail } })
    if (!parentUser) {
      parentUser = await (prisma as any).user.create({ data: { email: parentEmail, passwordHash: 'dev', role: 'PARENT', name: 'Родитель' } })
    }
    let parent = await (prisma as any).parent.findUnique({ where: { userId: parentUser.id } })
    if (!parent) parent = await (prisma as any).parent.create({ data: { userId: parentUser.id, isArchived: false } })
    // ensure child assigned to current logoped
    let child = await (prisma as any).child.findFirst({ where: { parentId: parent.id } })
    if (!child) {
      child = await (prisma as any).child.create({ data: { parentId: parent.id, firstName: 'Иван', lastName: 'Иванов', isArchived: false, logopedId } })
    } else if (child.logopedId !== logopedId) {
      await (prisma as any).child.update({ where: { id: child.id }, data: { logopedId, isArchived: false } })
    }
    // ensure group exists and synced
    try { await ensureLogopedGroup(logopedId) } catch {}
    return NextResponse.json({ ok: true, childId: child.id })
  } catch (e: any) {
    return new NextResponse('Error: ' + (e?.message || 'unknown'), { status: 500 })
  }
}
