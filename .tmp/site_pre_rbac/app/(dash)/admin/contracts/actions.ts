"use server"
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { promises as fs } from 'fs'
import path from 'path'

function ensureAdmin(session: any) {
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(role)) throw new Error('Forbidden')
}

export async function createContract(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureAdmin(session)

  const parentEmail = String(formData.get('parentEmail') || '').toLowerCase().trim()
  const childId = String(formData.get('childId') || '') || undefined
  if (!parentEmail) return

  const parentUser = await prisma.user.findUnique({ where: { email: parentEmail } })
  if (!parentUser) return
  const parent = await prisma.parent.findUnique({ where: { userId: parentUser.id } })
  if (!parent) return

  await prisma.contract.create({ data: { parentId: parent.id, childId, status: 'DRAFT' } })
  revalidatePath('/admin/contracts')
  return
}

export async function uploadSignedPdf(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureAdmin(session)

  const contractId = String(formData.get('contractId') || '')
  const file = formData.get('file') as File | null
  if (!contractId || !file) return

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'contracts')
  await fs.mkdir(uploadsDir, { recursive: true })

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const safeName = `${contractId}_${ts}.pdf`
  const fullPath = path.join(uploadsDir, safeName)
  await fs.writeFile(fullPath, buffer)

  const relUrl = `/uploads/contracts/${safeName}`
  await prisma.contract.update({ where: { id: contractId }, data: { status: 'ACTIVE', fileUrl: relUrl, signedAt: new Date() } })
  revalidatePath('/admin/contracts')
  return
}

export async function updateContractStatus(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureAdmin(session)
  const id = String(formData.get('id') || '')
  const status = String(formData.get('status') || '')
  if (!id || !status) return
  await prisma.contract.update({ where: { id }, data: { status } })
  revalidatePath('/admin/contracts')
  return
}
