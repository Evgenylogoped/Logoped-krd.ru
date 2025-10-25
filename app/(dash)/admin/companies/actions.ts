"use server"
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { promises as fs } from 'fs'
import path from 'path'

function ensureSuperAdmin(session: any) {
  const role = (session?.user as any)?.role
  if (!session || role !== 'SUPER_ADMIN') throw new Error('Forbidden')
}

export async function uploadCompanyLogo(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureSuperAdmin(session)
  const id = String(formData.get('id') || '')
  const file = formData.get('file') as File | null
  if (!id || !file) return
  const array = await file.arrayBuffer()
  const buffer = Buffer.from(array)
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'companies')
  await fs.mkdir(uploadsDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const safeName = ((file as any).name || 'logo.png').replace(/[^a-zA-Z0-9._-]+/g, '_')
  const fileName = `${id}_${ts}_${safeName}`
  const fullPath = path.join(uploadsDir, fileName)
  await fs.writeFile(fullPath, buffer)
  const url = `/uploads/companies/${fileName}`
  await prisma.company.update({ where: { id }, data: { logoUrl: url } })
  revalidatePath('/admin/companies')
}

export async function createCompany(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureSuperAdmin(session)
  const name = String(formData.get('name') || '').trim()
  const website = String(formData.get('website') || '').trim() || undefined
  const about = String(formData.get('about') || '').trim() || undefined
  if (!name) return
  await prisma.company.create({ data: { name, website, about } })
  revalidatePath('/admin/companies')
}

export async function updateCompany(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureSuperAdmin(session)
  const id = String(formData.get('id') || '')
  const name = String(formData.get('name') || '').trim()
  const website = String(formData.get('website') || '').trim() || undefined
  const about = String(formData.get('about') || '').trim() || undefined
  if (!id || !name) return
  await prisma.company.update({ where: { id }, data: { name, website, about } })
  revalidatePath('/admin/companies')
}

export async function deleteCompany(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureSuperAdmin(session)
  const id = String(formData.get('id') || '')
  if (!id) return
  await prisma.company.delete({ where: { id } })
  revalidatePath('/admin/companies')
}
