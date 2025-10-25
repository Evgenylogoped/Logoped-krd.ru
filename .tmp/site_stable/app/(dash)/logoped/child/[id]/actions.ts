"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendMail } from '@/lib/mail'
import { ensureLogopedGroup } from '@/app/chat/chatService'
import { promises as fs } from 'fs'
import fsSync from 'fs'
import path from 'path'

function ensureLogoped(session: any) {
  const role = (session?.user as any)?.role
  if (!session || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role)) throw new Error('Forbidden')
}

export async function requestTransfer(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Forbidden')
  const userRole = (session.user as any)?.role
  if (!['PARENT','LOGOPED','ADMIN','SUPER_ADMIN'].includes(userRole)) throw new Error('Forbidden')
  const childId = String(formData.get('childId') || '')
  const toLogopedId = String(formData.get('toLogopedId') || '')
  if (!childId || !toLogopedId) return
  const child = await prisma.child.findUnique({ where: { id: childId } })
  if (!child) return
  const fromLogopedId = (child as any).logopedId || ''
  if (!((prisma as any).transferRequest?.create)) { revalidatePath(`/logoped/child/${childId}`); return }
  const created = await (prisma as any).transferRequest.create({ data: {
    childId,
    fromLogopedId,
    toLogopedId,
    createdBy: (session.user as any).id as string,
    status: 'PENDING',
  } })
  // уведомить принимающего логопеда по email
  try {
    const toUser = await prisma.user.findUnique({ where: { id: toLogopedId } })
    const childFull = await prisma.child.findUnique({ where: { id: childId } })
    if (toUser?.email && childFull) {
      await sendMail({
        to: toUser.email,
        subject: 'Передача ребёнка',
        text: `Вам передан ребёнок на рассмотрение: ${childFull.lastName} ${childFull.firstName}. Зайдите в карточку ребёнка и подтвердите передачу.`,
      })
    }
  } catch {}
  revalidatePath(`/logoped/child/${childId}`)
  revalidatePath('/logoped/notifications')
}

export async function approveTransfer(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Forbidden')
  const userId = (session.user as any).id as string
  const role = (session.user as any).role as string
  const transferId = String(formData.get('transferId') || '')
  if (!transferId) return
  if (!((prisma as any).transferRequest?.findUnique)) { revalidatePath('/logoped/child'); return }
  const tr = await (prisma as any).transferRequest.findUnique({ where: { id: transferId } })
  if (!tr) return
  if (!(role === 'ADMIN' || role === 'SUPER_ADMIN' || tr.toLogopedId === userId)) throw new Error('Forbidden')
  // approve and reassign child
  if (!((prisma as any).transferRequest?.update)) { revalidatePath(`/logoped/child/${tr.childId}`); return }
  await prisma.$transaction([
    (prisma as any).transferRequest.update({ where: { id: transferId }, data: { status: 'APPROVED' } }),
    prisma.child.update({ where: { id: tr.childId }, data: { logopedId: tr.toLogopedId } as any })
  ])
  // уведомить принимающего и исходного логопедов
  try {
    const toUser = await prisma.user.findUnique({ where: { id: tr.toLogopedId } })
    const fromUser = await prisma.user.findUnique({ where: { id: tr.fromLogopedId } })
    const childFull = await prisma.child.findUnique({ where: { id: tr.childId } })
    if (toUser?.email && childFull) {
      await sendMail({ to: toUser.email, subject: 'Ребёнок принят', text: `Вы приняли ребёнка: ${childFull.lastName} ${childFull.firstName}.` })
    }
    if (fromUser?.email && childFull) {
      await sendMail({ to: fromUser.email, subject: 'Ребёнок передан', text: `Ребёнок ${childFull.lastName} ${childFull.firstName} передан другому логопеду.` })
    }
  } catch {}
  revalidatePath(`/logoped/child/${tr.childId}`)
  revalidatePath('/logoped/notifications')
}

export async function rejectTransfer(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  if (!session) throw new Error('Forbidden')
  const userId = (session.user as any).id as string
  const role = (session.user as any).role as string
  const transferId = String(formData.get('transferId') || '')
  if (!transferId) return
  if (!((prisma as any).transferRequest?.findUnique)) { revalidatePath('/logoped/child'); return }
  const tr = await (prisma as any).transferRequest.findUnique({ where: { id: transferId } })
  if (!tr) return
  if (!(role === 'ADMIN' || role === 'SUPER_ADMIN' || tr.toLogopedId === userId || tr.fromLogopedId === userId)) throw new Error('Forbidden')
  if (!((prisma as any).transferRequest?.update)) { revalidatePath(`/logoped/child/${tr.childId}`); return }
  await (prisma as any).transferRequest.update({ where: { id: transferId }, data: { status: 'REJECTED' } })
  revalidatePath(`/logoped/child/${tr.childId}`)
  revalidatePath('/logoped/notifications')
}

export async function uploadChildPhoto(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const id = String(formData.get('id') || '')
  const file = formData.get('file') as File | null
  if (!id || !file) return
  const array = await file.arrayBuffer()
  const buffer = Buffer.from(array)
  // Resolve absolute path to project's public/ regardless of runtime cwd (standalone/server)
  function resolvePublicDir() {
    let dir = process.cwd()
    const root = path.parse(dir).root
    while (dir && dir !== root) {
      if (fsSync.existsSync(path.join(dir, 'public'))) return path.join(dir, 'public')
      if (fsSync.existsSync(path.join(dir, 'package.json'))) return path.join(dir, 'public')
      dir = path.dirname(dir)
    }
    return path.join(process.cwd(), 'public')
  }
  const uploadsDir = path.join(resolvePublicDir(), 'uploads', 'children')
  await fs.mkdir(uploadsDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const safeName = ((file as any).name || 'photo.png').replace(/[^a-zA-Z0-9._-]+/g, '_')
  const fileName = `${id}_${ts}_${safeName}`
  const fullPath = path.join(uploadsDir, fileName)
  await fs.writeFile(fullPath, buffer)
  const url = `/uploads/children/${fileName}`
  await prisma.child.update({ where: { id }, data: { photoUrl: url } as any })
  revalidatePath(`/logoped/child/${id}`)
  // @ts-ignore
  ;(await import('next/navigation')).redirect(`/logoped/child/${id}?saved=1`)
}

export async function updateParent(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const parentId = String(formData.get('parentId') || '')
  const fullName = String(formData.get('fullName') || '').trim() || undefined
  const phone = String(formData.get('phone') || '').trim() || undefined
  const info = String(formData.get('info') || '').trim() || undefined
  const email = String(formData.get('email') || '').trim() || undefined
  const childId = String(formData.get('childId') || '')
  if (!parentId) return
  await prisma.parent.update({ where: { id: parentId }, data: { fullName, phone, info } as any })
  if (email) {
    const parent = await prisma.parent.findUnique({ where: { id: parentId }, include: { user: true } })
    if (parent) {
      await prisma.user.update({ where: { id: parent.userId }, data: { email } }).catch(()=>{})
    }
  }
  revalidatePath(`/logoped/child/${childId}?tab=parent`)
  redirect(`/logoped/child/${childId}?tab=parent&saved=1`)
}

export async function updateChild(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const id = String(formData.get('id') || '')
  const firstName = String(formData.get('firstName') || '').trim()
  const lastName = String(formData.get('lastName') || '').trim()
  const birthDateRaw = String(formData.get('birthDate') || '').trim()
  const diagnosis = String(formData.get('diagnosis') || '').trim() || undefined
  const conclusion = String(formData.get('conclusion') || '').trim() || undefined
  const allowSelfEnroll = formData.getAll('allowSelfEnroll').map(String).includes('on')
  const rateLessonRaw = String(formData.get('rateLesson') || '').trim()
  const rateConsultationRaw = String(formData.get('rateConsultation') || '').trim()
  const showDiagnosisToParent = formData.getAll('showDiagnosisToParent').map(String).includes('on')
  const showConclusionToParent = formData.getAll('showConclusionToParent').map(String).includes('on')
  const showPhotoToParent = formData.getAll('showPhotoToParent').map(String).includes('on')
  const logopedId = String(formData.get('logopedId') || '').trim() || undefined
  if (!id || !firstName || !lastName) return
  const birthDate = birthDateRaw ? new Date(birthDateRaw) : null
  // Безопасный парс чисел: допускаем пробелы и запятые
  const normalizeNumber = (s: string): number | null => {
    const cleaned = s.replace(/\s+/g, '').replace(',', '.')
    if (cleaned === '') return null
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : NaN
  }
  const rateLessonParsed = normalizeNumber(rateLessonRaw)
  const rateConsultationParsed = normalizeNumber(rateConsultationRaw)
  if (Number.isNaN(rateLessonParsed)) {
    redirect(`/logoped/child/${id}?tab=main&err=invalid_rate_lesson`)
  }
  if (Number.isNaN(rateConsultationParsed)) {
    redirect(`/logoped/child/${id}?tab=main&err=invalid_rate_consult`)
  }
  const rateLesson = rateLessonParsed
  const rateConsultation = rateConsultationParsed
  // Блокировка изменения цены занятия при наличии незакрытых орг-занятий
  let snapshot: any = null
  try {
    const current = await prisma.child.findUnique({ where: { id }, select: { rateLesson: true, rateConsultation: true, firstName: true, lastName: true, birthDate: true, diagnosis: true, conclusion: true, allowSelfEnroll: true, showDiagnosisToParent: true, showConclusionToParent: true, showPhotoToParent: true, logopedId: true } })
    snapshot = current
    const currentRate: number | null = (current?.rateLesson === null || current?.rateLesson === undefined)
      ? null
      : Number(current!.rateLesson as any)
    const newRate: number | null = rateLesson
    const willChangeRate = (rateLessonRaw !== '') && (
      (currentRate === null && newRate !== null) ||
      (currentRate !== null && newRate === null) ||
      (currentRate !== null && newRate !== null && Number.isFinite(currentRate) && Number.isFinite(newRate) && currentRate !== newRate)
    )
    if (willChangeRate) {
      // SQLite-friendly: считаем на JS по загруженным транзакциям
      const unsettledRaw = await (prisma as any).lesson.findMany({
        where: {
          enrolls: { some: { childId: id } },
          settledAt: { not: null, lt: new Date() },
          payoutStatus: 'NONE',
        },
        include: { transactions: true },
        take: 2000,
      })
      const unsettledCount = (unsettledRaw as any[]).filter(L => (L.transactions||[]).some((t:any)=> Boolean(t?.companyId))).length
      if (unsettledCount > 0) {
        redirect(`/logoped/child/${id}?tab=main&err=rate_block`)
      }
    }
  } catch (e:any) {
    // Если это не наш redirect — направим с общей ошибкой
    redirect(`/logoped/child/${id}?tab=main&err=save_failed`)
  }

  // Определяем изменённые поля, чтобы показать уведомление
  const computeChanged = () => {
    let changed = false
    if (snapshot) {
      if ((snapshot.firstName||'') !== firstName) changed = true
      if ((snapshot.lastName||'') !== lastName) changed = true
      const curBirth = snapshot.birthDate ? new Date(snapshot.birthDate).toISOString().slice(0,10) : ''
      const newBirth = birthDate ? birthDate.toISOString().slice(0,10) : ''
      if (curBirth !== newBirth) changed = true
      if ((snapshot.diagnosis||'') !== (diagnosis||'')) changed = true
      if ((snapshot.conclusion||'') !== (conclusion||'')) changed = true
      if (Boolean(snapshot.allowSelfEnroll) !== Boolean(allowSelfEnroll)) changed = true
      const curRL = snapshot.rateLesson === null || snapshot.rateLesson === undefined ? null : Number(snapshot.rateLesson as any)
      const curRC = snapshot.rateConsultation === null || snapshot.rateConsultation === undefined ? null : Number(snapshot.rateConsultation as any)
      if ((curRL ?? null) !== (rateLesson ?? null)) changed = true
      if ((curRC ?? null) !== (rateConsultation ?? null)) changed = true
      if (Boolean((snapshot as any).showDiagnosisToParent) !== Boolean(showDiagnosisToParent)) changed = true
      if (Boolean((snapshot as any).showConclusionToParent) !== Boolean(showConclusionToParent)) changed = true
      if (Boolean((snapshot as any).showPhotoToParent) !== Boolean(showPhotoToParent)) changed = true
      if ((snapshot.logopedId||'') !== (logopedId||'')) changed = true
    } else {
      changed = true
    }
    return changed
  }
  const hasChanges = computeChanged()
  if (!hasChanges) {
    redirect(`/logoped/child/${id}?tab=main&saved=0`)
  }

  await prisma.child.update({
    where: { id },
    data: {
      firstName,
      lastName,
      birthDate: birthDate ?? undefined,
      diagnosis,
      conclusion,
      allowSelfEnroll,
      rateLesson: rateLesson ?? undefined,
      rateConsultation: rateConsultation ?? undefined,
      showDiagnosisToParent,
      showConclusionToParent,
      showPhotoToParent,
      logopedId,
    } as any,
  })
  // Синхронизируем группу логопеда с родителями активных детей
  if (logopedId) {
    try { await ensureLogopedGroup(logopedId) } catch {}
  }
  revalidatePath(`/logoped/child/${id}`)
  redirect(`/logoped/child/${id}?tab=main&saved=1`)
}

export async function uploadMaterial(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const childId = String(formData.get('childId') || '')
  const name = String(formData.get('name') || '').trim()
  const file = formData.get('file') as File | null
  if (!childId || !file) return
  const array = await file.arrayBuffer()
  const buffer = Buffer.from(array)
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'materials')
  await fs.mkdir(uploadsDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const safeBase = (name || (file as any).name || 'material').replace(/[^a-zA-Z0-9._-]+/g, '_')
  const fileName = `${childId}_${ts}_${safeBase}`
  const fullPath = path.join(uploadsDir, fileName)
  await fs.writeFile(fullPath, buffer)
  const url = `/uploads/materials/${fileName}`
  await prisma.document.create({ data: { childId, name: name || (file as any).name || 'Материал', url, mimeType: (file as any).type || 'application/octet-stream' } })
  revalidatePath(`/logoped/child/${childId}?tab=materials`)
}

export async function deleteMaterial(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const id = String(formData.get('id') || '')
  const childId = String(formData.get('childId') || '')
  if (!id) return
  await prisma.document.delete({ where: { id } }).catch(()=>{})
  revalidatePath(`/logoped/child/${childId}?tab=materials`)
}

export async function addProgress(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const childId = String(formData.get('childId') || '')
  const score = Number(formData.get('score') || 0)
  const note = String(formData.get('note') || '').trim() || undefined
  if (!childId) return
  await (prisma as any).progressEntry.create({ data: { childId, score, note } })
  revalidatePath(`/logoped/child/${childId}?tab=progress`)
}

export async function deleteProgress(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const id = String(formData.get('id') || '')
  const childId = String(formData.get('childId') || '')
  if (!id) return
  await (prisma as any).progressEntry.delete({ where: { id } })
  revalidatePath(`/logoped/child/${childId}?tab=progress`)
}

export async function addReward(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const childId = String(formData.get('childId') || '')
  const kind = String(formData.get('kind') || '').trim() || 'star'
  const title = String(formData.get('title') || '').trim() || undefined
  if (!childId) return
  await (prisma as any).childReward.create({ data: { childId, kind, title } })
  revalidatePath(`/logoped/child/${childId}?tab=rewards`)
}

export async function deleteReward(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const id = String(formData.get('id') || '')
  const childId = String(formData.get('childId') || '')
  if (!id) return
  await (prisma as any).childReward.delete({ where: { id } })
  revalidatePath(`/logoped/child/${childId}?tab=rewards`)
}
