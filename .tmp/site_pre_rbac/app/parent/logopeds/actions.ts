"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function ensureParent(session: any) {
  const role = (session?.user as any)?.role
  if (!session?.user || role !== 'PARENT') throw new Error('Forbidden')
}

export async function detachChildFromLogoped(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const userId = (session!.user as any).id as string
  const childId = String(formData.get('childId') || '')
  if (!childId) return
  const parent = await prisma.parent.findUnique({ where: { userId } })
  const child = await prisma.child.findUnique({ where: { id: childId } })
  if (!parent || !child || child.parentId !== parent.id) throw new Error('Forbidden')
  await prisma.child.update({ where: { id: childId }, data: { logopedId: null } })
  revalidatePath('/parent/logopeds')
  redirect('/parent/logopeds?saved=1')
}

export async function assignChildToLogoped(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const userId = (session!.user as any).id as string
  const childId = String(formData.get('childId') || '')
  const logopedId = String(formData.get('logopedId') || '')
  if (!childId || !logopedId) return
  const parent = await prisma.parent.findUnique({ where: { userId } })
  const child = await prisma.child.findUnique({ where: { id: childId } })
  const logoped = await prisma.user.findUnique({ where: { id: logopedId } })
  if (!parent || !child || child.parentId !== parent.id) throw new Error('Forbidden')
  if (!logoped || logoped.role !== 'LOGOPED') throw new Error('Bad logoped')
  await prisma.child.update({ where: { id: childId }, data: { logopedId } })
  revalidatePath('/parent/logopeds')
  redirect('/parent/logopeds?saved=1')
}

export async function requestTransferByEmail(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const userId = (session!.user as any).id as string
  const childId = String(formData.get('childId') || '')
  const email = String(formData.get('email') || '').trim().toLowerCase()
  const note = String(formData.get('note') || '').trim() || null
  if (!childId || !email) return
  const parent = await prisma.parent.findUnique({ where: { userId } })
  const child = await prisma.child.findUnique({ where: { id: childId } })
  if (!parent || !child || child.parentId !== parent.id) throw new Error('Forbidden')
  const target = await prisma.user.findUnique({ where: { email } })
  if (!target || target.role !== 'LOGOPED') {
    revalidatePath('/parent/logopeds')
    redirect('/parent/logopeds?transfer=notfound')
  }
  await prisma.activationRequest.create({
    data: {
      parentId: parent.id,
      targetLogopedId: target.id,
      status: 'PENDING',
      note: note || undefined,
    } as any,
  })
  revalidatePath('/parent/logopeds')
  redirect('/parent/logopeds?transfer=ok')
}
