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

export async function addChild(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const userId = (session!.user as any).id as string
  const parent = await prisma.parent.findUnique({ where: { userId } })
  if (!parent) throw new Error('Parent not found')
  const firstName = String(formData.get('firstName') || '').trim()
  const lastName = String(formData.get('lastName') || '').trim()
  const birthDateStr = String(formData.get('birthDate') || '').trim()
  if (!firstName || !lastName) return
  const birthDate = birthDateStr ? new Date(birthDateStr) : null
  await prisma.child.create({ data: { parentId: parent.id, firstName, lastName, birthDate: birthDate || undefined, isArchived: false } as any })
  revalidatePath('/settings/children')
  redirect('/settings/children?saved=1')
}

export async function updateChild(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const userId = (session!.user as any).id as string
  const id = String(formData.get('id') || '')
  const firstName = String(formData.get('firstName') || '').trim()
  const lastName = String(formData.get('lastName') || '').trim()
  const birthDateStr = String(formData.get('birthDate') || '').trim()
  if (!id || !firstName || !lastName) return
  const child = await prisma.child.findUnique({ where: { id } })
  const parent = await prisma.parent.findUnique({ where: { userId } })
  if (!child || !parent || child.parentId !== parent.id) return
  const birthDate = birthDateStr ? new Date(birthDateStr) : null
  await prisma.child.update({ where: { id }, data: { firstName, lastName, birthDate: birthDate ?? undefined } as any })
  revalidatePath('/settings/children')
  redirect('/settings/children?saved=1')
}

export async function uploadChildPhoto(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const userId = (session!.user as any).id as string
  const id = String(formData.get('id') || '')
  const file = formData.get('file') as File | null
  if (!id || !file) return
  const child = await prisma.child.findUnique({ where: { id } })
  const parent = await prisma.parent.findUnique({ where: { userId } })
  if (!child || !parent || child.parentId !== parent.id) return
  // validate file (любой image/* до 10 МБ)
  const maxBytes = 10 * 1024 * 1024 // 10MB
  const mime = (file as any).type || ''
  const size = (file as any).size || 0
  if (!mime.startsWith('image/')) {
    revalidatePath('/settings/children')
    redirect('/settings/children?photoError=type')
  }
  if (size > maxBytes) {
    revalidatePath('/settings/children')
    redirect('/settings/children?photoError=size')
  }
  try {
    const array = await file.arrayBuffer()
    const buffer = Buffer.from(array)
    const { promises: fs } = await import('fs')
    const path = await import('path')
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'children')
    await fs.mkdir(uploadsDir, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const safeName = ((file as any).name || 'photo.png').replace(/[^a-zA-Z0-9._-]+/g, '_')
    const fileName = `${id}_${ts}_${safeName}`
    const fullPath = path.join(uploadsDir, fileName)
    await fs.writeFile(fullPath, buffer)
    const url = `/uploads/children/${fileName}`
    await prisma.child.update({ where: { id }, data: { photoUrl: url } as any })
    revalidatePath('/settings/children')
    redirect('/settings/children?saved=1')
  } catch (e) {
    revalidatePath('/settings/children')
    redirect('/settings/children?photoError=server')
  }
}

export async function deleteChildPhoto(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const userId = (session!.user as any).id as string
  const id = String(formData.get('id') || '')
  if (!id) return
  const child = await prisma.child.findUnique({ where: { id } })
  const parent = await prisma.parent.findUnique({ where: { userId } })
  if (!child || !parent || child.parentId !== parent.id) return
  await prisma.child.update({ where: { id }, data: { photoUrl: null } as any })
  revalidatePath('/settings/children')
  redirect('/settings/children?saved=1')
}

export async function deleteChild(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const userId = (session!.user as any).id as string
  const id = String(formData.get('id') || '')
  if (!id) return
  // ensure this child belongs to this parent
  const child = await prisma.child.findUnique({ where: { id } })
  const parent = await prisma.parent.findUnique({ where: { userId } })
  if (!child || !parent || child.parentId !== parent.id) return
  // Мягкое удаление: архивируем ребёнка, отвязываем логопеда и отменяем будущие записи
  const now = new Date()
  await prisma.$transaction([
    prisma.enrollment.updateMany({
      where: { childId: id, status: 'ENROLLED', lesson: { startsAt: { gte: now } } },
      data: { status: 'CANCELLED' },
    }),
    prisma.child.update({ where: { id }, data: { isArchived: true, logopedId: null } as any }),
  ])
  revalidatePath('/settings/children')
  redirect('/settings/children?saved=1')
}
