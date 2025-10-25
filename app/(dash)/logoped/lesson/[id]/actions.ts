"use server"
import { revalidatePath } from 'next/cache'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { applyLessonSettlement } from '@/services/finance'
import { redirect } from 'next/navigation'

function ensureLogoped(session: any) {
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','LOGOPED'].includes(role)) throw new Error('Forbidden')
}

export async function submitEvaluation(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const lessonId = String(formData.get('lessonId') || '')
  const childId = String(formData.get('childId') || '') || undefined as any
  const paymentMethod = (String(formData.get('paymentMethod') || 'AUTO') as any)
  // По умолчанию оценки = 5, можно снижать
  const homeworkRating = Number(formData.get('homeworkRating') || 5)
  const lessonRating = Number(formData.get('lessonRating') || 5)
  const behaviorRating = Number(formData.get('behaviorRating') || 5)
  const comment = String(formData.get('comment') || '') || undefined
  const showToParent = String(formData.get('showToParent') || '') === 'on'
  if (!lessonId) return
  const createdBy = (session!.user as any).id as string
  // Проверка: урок должен принадлежать текущему логопеду
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } })
  if (!lesson || lesson.logopedId !== createdBy) {
    redirect(`/logoped/lesson/${lessonId}?forbidden=1`)
  }
  // Повторная фиксация запрещена: если lesson уже settled или оценка DONE — не обновляем
  if (lesson.settledAt) {
    redirect(`/logoped/lesson/${lessonId}?saved=1`)
  }
  const existing = await (prisma as any).lessonEvaluation.findFirst({ where: { lessonId, childId: childId ?? null } })
  if (existing) {
    // Если уже DONE — не позволяем менять
    if (existing.status === 'DONE') {
      redirect(`/logoped/lesson/${lessonId}?saved=1`)
    }
    await (prisma as any).lessonEvaluation.update({ where: { id: existing.id }, data: { homeworkRating, lessonRating, behaviorRating, comment, showToParent, status: 'DONE' } })
  } else {
    await (prisma as any).lessonEvaluation.create({ data: { lessonId, childId, homeworkRating, lessonRating, behaviorRating, comment, showToParent, status: 'DONE', createdBy } })
  }
  // Начисление по уроку (идемпотентно: если уже учтён, будет no-op)
  await applyLessonSettlement(lessonId, paymentMethod)
  revalidatePath('/logoped/schedule')
  revalidatePath(`/logoped/lesson/${lessonId}`)
  if (childId) revalidatePath(`/logoped/child/${childId}`)
  revalidatePath('/parent/enrollments')
  revalidatePath('/logoped')
  redirect(`/logoped/lesson/${lessonId}?saved=1`)
}

export async function markLessonCancelled(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const lessonId = String(formData.get('lessonId') || '')
  const childId = String(formData.get('childId') || '') || undefined as any
  if (!lessonId) return
  const createdBy = (session!.user as any).id as string
  // Проверка: урок должен принадлежать текущему логопеду
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } })
  if (!lesson || lesson.logopedId !== createdBy) {
    revalidatePath('/logoped/schedule')
    redirect(`/logoped/lesson/${lessonId}?forbidden=1`)
  }
  await (prisma as any).lessonEvaluation.create({ data: { lessonId, childId, status: 'CANCELLED', createdBy } })
  revalidatePath('/logoped/schedule')
  revalidatePath(`/logoped/lesson/${lessonId}`)
  if (childId) revalidatePath(`/logoped/child/${childId}`)
  revalidatePath('/parent/enrollments')
  revalidatePath('/logoped')
}

export async function createChildForLesson(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const lessonId = String(formData.get('lessonId') || '')
  const parentEmail = String(formData.get('parentEmail') || '').trim()
  const firstName = String(formData.get('firstName') || '').trim()
  const lastName = String(formData.get('lastName') || '').trim()
  if (!lessonId || !parentEmail || !firstName || !lastName) return
  // Ищем существующего родителя по email
  const user = await prisma.user.findUnique({ where: { email: parentEmail } })
  if (!user) return
  const parent = await prisma.parent.findUnique({ where: { userId: user.id } })
  if (!parent) return
  // Создаём карточку ребёнка
  const child = await prisma.child.create({ data: { parentId: parent.id, firstName, lastName } })
  // Привязываем к прошедшему уроку (для истории)
  await prisma.enrollment.create({ data: { childId: child.id, lessonId, status: 'ENROLLED' } }).catch(()=>{})
  revalidatePath(`/logoped/lesson/${lessonId}`)
}
