"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

function ensureAccountant(session: any) {
  const role = (session?.user as any)?.role
  if (!session?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) throw new Error('Forbidden')
}

export async function requestTransferByEmail(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const childId = String(formData.get('childId') || '')
  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (!childId || !email) return
  const child = await prisma.child.findUnique({ where: { id: childId } })
  if (!child) return
  // найти логопеда по email вне зависимости от компании
  const toUser = await prisma.user.findUnique({ where: { email } })
  if (!toUser || (toUser as any).role !== 'LOGOPED') {
    revalidatePath('/admin/clients')
    // @ts-ignore
    ;(await import('next/navigation')).redirect('/admin/clients?transferEmailNotFound=1')
    return
  }
  const fromLogopedId = (child as any).logopedId || ''
  if (!((prisma as any).transferRequest?.create)) { revalidatePath('/admin/clients'); return }
  await (prisma as any).transferRequest.create({ data: {
    childId,
    fromLogopedId,
    toLogopedId: toUser.id,
    createdBy: (session!.user as any).id,
    status: 'PENDING',
  } })
  try { await (prisma as any).auditLog?.create({ data: { action: 'child.transfer_by_email', payload: JSON.stringify({ childId, toEmail: email, toLogopedId: toUser.id }), createdAt: new Date() } }) } catch {}
  revalidatePath('/admin/clients')
}

export async function updateChildLogoped(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const childId = String(formData.get('childId') || '')
  const logopedId = String(formData.get('logopedId') || '') || null
  if (!childId) return
  await prisma.child.update({ where: { id: childId }, data: { logopedId: logopedId || null } as any })
  try { await (prisma as any).auditLog?.create({ data: { action: 'child.update_logoped', payload: JSON.stringify({ childId, logopedId }), createdAt: new Date() } }) } catch {}
  revalidatePath('/admin/clients')
}

export async function uploadParentDocument(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const parentId = String(formData.get('parentId') || '')
  const name = String(formData.get('name') || '').trim() || 'Документ'
  const file = formData.get('file') as File | null
  if (!parentId || !file) return
  const array = await file.arrayBuffer()
  const buffer = Buffer.from(array)
  const { promises: fs } = await import('fs')
  const path = await import('path')
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'documents')
  await fs.mkdir(uploadsDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const safe = ((file as any).name || name).replace(/[^a-zA-Z0-9._-]+/g, '_')
  const filename = `${parentId}_${ts}_${safe}`
  const full = path.join(uploadsDir, filename)
  await fs.writeFile(full, buffer)
  const url = `/uploads/documents/${filename}`
  await prisma.document.create({ data: { parentId, name, url, mimeType: (file as any).type || 'application/octet-stream' } })
  try { await (prisma as any).auditLog?.create({ data: { action: 'parent.upload_document', payload: JSON.stringify({ parentId, name, url }), createdAt: new Date() } }) } catch {}
  revalidatePath('/admin/clients')
}

export async function createParentContract(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const parentId = String(formData.get('parentId') || '')
  const childId = String(formData.get('childId') || '') || null
  if (!parentId) return
  await prisma.contract.create({ data: { parentId, childId: childId || null, status: 'DRAFT' } as any })
  try { await (prisma as any).auditLog?.create({ data: { action: 'parent.create_contract', payload: JSON.stringify({ parentId, childId }), createdAt: new Date() } }) } catch {}
  revalidatePath('/admin/clients')
}

async function auditLog(action: string, payload: Record<string, any>) {
  const client: any = prisma as any
  if (!client.auditLog) return
  try { await client.auditLog.create({ data: { action, payload: JSON.stringify(payload), createdAt: new Date() } }) } catch {}
}

export async function deleteParent(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const parentId = String(formData.get('parentId') || '')
  if (!parentId) return
  const parent = await (prisma as any).parent.findUnique({ where: { id: parentId }, include: { user: true, children: true } })
  if (!parent) return
  await (prisma as any).$transaction(async (tx: any) => {
    await tx.child.updateMany({ where: { parentId }, data: { isArchived: true } })
    await tx.parent.update({ where: { id: parentId }, data: { isArchived: true } })
  })
  await auditLog('parent.archive', { parentId, userId: parent.userId })
  revalidatePath('/admin/clients')
}

export async function bulkDeleteParents(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const ids = (formData.getAll('ids') || []).map(v => String(v)).filter(Boolean)
  if (!ids.length) return
  await (prisma as any).$transaction(async (tx: any) => {
    await tx.child.updateMany({ where: { parentId: { in: ids } }, data: { isArchived: true } })
    await tx.parent.updateMany({ where: { id: { in: ids } } }, { data: { isArchived: true } } as any).catch(async ()=>{
      // fallback for clients using the old prisma where signature
      for (const id of ids) await tx.parent.update({ where: { id }, data: { isArchived: true } })
    })
  })
  await auditLog('parent.bulk_archive', { ids })
  revalidatePath('/admin/clients')
}

export async function deleteChild(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const childId = String(formData.get('childId') || '')
  if (!childId) return
  const now = new Date()
  await prisma.$transaction([
    prisma.enrollment.updateMany({ where: { childId, status: 'ENROLLED', lesson: { startsAt: { gte: now } } }, data: { status: 'CANCELLED' } }),
    prisma.child.update({ where: { id: childId }, data: { isArchived: true, logopedId: null } as any }),
  ])
  await auditLog('child.archive', { childId })
  revalidatePath('/admin/clients')
}

export async function bulkDeleteChildren(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const ids = (formData.getAll('childIds') || []).map(v => String(v)).filter(Boolean)
  if (!ids.length) return
  const now = new Date()
  await prisma.$transaction([
    prisma.enrollment.updateMany({ where: { childId: { in: ids }, status: 'ENROLLED', lesson: { startsAt: { gte: now } } }, data: { status: 'CANCELLED' } }),
    prisma.child.updateMany({ where: { id: { in: ids } }, data: { isArchived: true, logopedId: null } as any }),
  ])
  await auditLog('child.bulk_archive', { ids })
  revalidatePath('/admin/clients')
}

export async function restoreParent(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const parentId = String(formData.get('parentId') || '')
  if (!parentId) return
  await (prisma as any).parent.update({ where: { id: parentId }, data: { isArchived: false } })
  await (prisma as any).child.updateMany({ where: { parentId }, data: { isArchived: false } })
  await auditLog('parent.restore', { parentId })
  revalidatePath('/admin/clients')
}

export async function restoreChild(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const childId = String(formData.get('childId') || '')
  if (!childId) return
  await (prisma as any).child.update({ where: { id: childId }, data: { isArchived: false } })
  await auditLog('child.restore', { childId })
  revalidatePath('/admin/clients')
}

export async function updateParentAdmin(formData: FormData) {
  const session = await getServerSession(authOptions)
  ensureAccountant(session)
  const parentId = String(formData.get('parentId') || '')
  if (!parentId) return
  const name = String(formData.get('name') || '').trim() || null
  const email = String(formData.get('email') || '').trim() || null
  const city = String(formData.get('city') || '').trim() || null
  const address = String(formData.get('address') || '').trim() || null
  const fullName = String(formData.get('fullName') || '').trim() || null
  const phone = String(formData.get('phone') || '').trim() || null
  const info = String(formData.get('info') || '').trim() || null
  const isArchived = String(formData.get('isArchived') || '') === 'on'
  const notifyByEmail = String(formData.get('notifyByEmail') || '') === 'on'
  const timeZone = String(formData.get('timeZone') || '').trim() || null
  const parent = await (prisma as any).parent.findUnique({ where: { id: parentId }, include: { user: true } })
  if (!parent) return
  await prisma.parent.update({ where: { id: parentId }, data: { fullName: fullName ?? undefined, phone: phone ?? undefined, info: info ?? undefined, isArchived } as any })
  await prisma.user.update({ where: { id: parent.userId }, data: { name: name ?? undefined, email: email ?? undefined, city: city ?? undefined, address: address ?? undefined, notifyByEmail, timeZone: timeZone ?? undefined } })
  try { await (prisma as any).auditLog?.create({ data: { action: 'parent.update_admin', payload: JSON.stringify({ parentId, name, email, city, address, fullName, phone, info, isArchived, notifyByEmail, timeZone }), createdAt: new Date() } }) } catch {}
  revalidatePath('/admin/clients')
}
