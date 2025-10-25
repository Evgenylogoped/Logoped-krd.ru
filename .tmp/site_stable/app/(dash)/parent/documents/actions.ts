"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { promises as fs } from 'fs'
import path from 'path'

function ensureParent(session: any) {
  const role = (session?.user as any)?.role
  if (!session || role !== 'PARENT') throw new Error('Forbidden')
}

export async function uploadDocument(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const userId = (session!.user as any).id as string
  const parent = await prisma.parent.findUnique({ where: { userId } })
  if (!parent) return

  const file = formData.get('file') as File | null
  const name = String(formData.get('name') || '').trim()
  if (!file) return

  const array = await file.arrayBuffer()
  const buffer = Buffer.from(array)
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'documents')
  await fs.mkdir(uploadsDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const safeBase = (name || (file as any).name || 'document').replace(/[^a-zA-Z0-9._-]+/g, '_')
  const fileName = `${parent.id}_${ts}_${safeBase}`
  const fullPath = path.join(uploadsDir, fileName)
  await fs.writeFile(fullPath, buffer)

  const url = `/uploads/documents/${fileName}`
  await prisma.document.create({ data: { parentId: parent.id, name: name || (file as any).name || 'Документ', url, mimeType: (file as any).type || 'application/octet-stream' } })
  revalidatePath('/parent/documents')
}

export async function deleteDocument(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const userId = (session!.user as any).id as string
  const parent = await prisma.parent.findUnique({ where: { userId } })
  if (!parent) return

  const id = String(formData.get('id') || '')
  const doc = await prisma.document.findUnique({ where: { id } })
  if (!doc || (doc.parentId !== parent.id && doc.childId == null)) return

  await prisma.document.delete({ where: { id } })
  revalidatePath('/parent/documents')
}
