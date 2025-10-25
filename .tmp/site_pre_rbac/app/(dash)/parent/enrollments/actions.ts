"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { sendMail } from '@/lib/mail'

function ensureParent(session: any) {
  const role = (session?.user as any)?.role
  if (!session || role !== 'PARENT') throw new Error('Forbidden')
}


export async function cancelEnrollmentParent(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const childId = String(formData.get('childId') || '')
  const lessonId = String(formData.get('lessonId') || '')
  const reason = String(formData.get('reason') || '').trim()
  if (!childId || !lessonId) return
  const enrollment = await prisma.enrollment.findUnique({ where: { childId_lessonId: { childId, lessonId } }, include: { child: { include: { parent: true } }, lesson: { include: { logoped: true } } } }) as any
  if (!enrollment || enrollment.status !== 'ENROLLED') { revalidatePath('/parent/lessons'); return }
  const userId = (session!.user as any).id as string
  const parent = await prisma.parent.findUnique({ where: { userId } })
  if (!parent || enrollment.child.parentId !== parent.id) { revalidatePath('/parent/lessons'); return }
  await prisma.enrollment.update({ where: { childId_lessonId: { childId, lessonId } }, data: { status: 'CANCELLED' } })
  try {
    const email = enrollment.lesson?.logoped?.email as string | undefined
    if (email) {
      const when = new Date(enrollment.lesson.startsAt).toLocaleString('ru-RU')
      await sendMail({ to: email, subject: 'Родитель отменил запись', text: `Родитель отменил запись на занятие "${enrollment.lesson.title}" (${when}).${reason?`\nПричина: ${reason}`:''}` })
    }
  } catch {}
  revalidatePath('/parent/lessons')
  // @ts-ignore
  ;(await import('next/navigation')).redirect('/parent/lessons?tab=future&cancelledEnrollment=1')
}

export async function cancelBookingParent(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const bookingId = String(formData.get('bookingId') || '')
  const reason = String(formData.get('reason') || '').trim()
  if (!bookingId) return
  const userId = (session!.user as any).id as string
  const parent = await prisma.parent.findUnique({ where: { userId } })
  if (!parent) { revalidatePath('/parent/lessons'); return }
  const booking = await (prisma as any).booking.findUnique({ where: { id: bookingId }, include: { child: { include: { parent: true } }, lesson: { include: { logoped: true } } } })
  if (!booking || booking.status !== 'ACTIVE') { revalidatePath('/parent/lessons'); return }
  if ((booking.child as any)?.parentId !== parent.id) { revalidatePath('/parent/lessons'); return }
  await prisma.booking.update({ where: { id: bookingId }, data: { status: 'CANCELLED', liquidatedAt: new Date() } })
  // Уведомить логопеда о причине отмены, если доступен email
  try {
    const logopedEmail = (booking.lesson as any)?.logoped?.email as string | undefined
    if (logopedEmail) {
      const childName = `${booking.child?.lastName ?? ''} ${booking.child?.firstName ?? ''}`.trim()
      const when = new Date(booking.lesson.startsAt).toLocaleString('ru-RU')
      const text = `Родитель отменил заявку на занятие "${booking.lesson.title}" (${when}).${reason?`\nПричина: ${reason}`:''}`
      await sendMail({ to: logopedEmail, subject: 'Заявка отменена родителем', text })
    }
  } catch {}
  revalidatePath('/parent/lessons')
  // @ts-ignore
  ;(await import('next/navigation')).redirect('/parent/lessons?tab=future&cancelledBooking=1')
}

export async function requestActivation(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const targetLogopedId = String(formData.get('targetLogopedId') || '')
  const note = String(formData.get('note') || '') || undefined as any
  if (!targetLogopedId) return
  const userId = (session!.user as any).id as string
  const parent = await (prisma as any).parent.findUnique({ where: { userId } })
  if (!parent) return
  await (prisma as any).activationRequest.create({ data: { parentId: parent.id, targetLogopedId, note, status: 'PENDING' } })
  revalidatePath('/parent/enrollments')
  // use redirect to ensure toast/banner shows
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  ;(await import('next/navigation')).redirect('/parent/enrollments?activationRequested=1')
}

export async function enroll(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const childId = String(formData.get('childId') || '')
  const lessonId = String(formData.get('lessonId') || '')
  if (!childId || !lessonId) return
  // Check permission for self-enroll
  const child = await prisma.child.findUnique({ where: { id: childId } })
  if (!child || !(child as any).allowSelfEnroll) {
    revalidatePath('/parent/enrollments')
    // @ts-ignore
    ;(await import('next/navigation')).redirect('/parent/enrollments?forbidden=1')
    return
  }
  // Prevent overlapping enrollments among parent's children
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { logoped: true } })
  if (!lesson) { revalidatePath('/parent/enrollments'); return }
  const parent = await prisma.parent.findUnique({ where: { id: (child as any).parentId }, include: { children: true } })
  const siblingIds = (parent?.children ?? []).map(c => c.id)
  if (siblingIds.length > 0) {
    const overlaps = await prisma.enrollment.findFirst({
      where: {
        childId: { in: siblingIds },
        status: 'ENROLLED',
        lesson: { OR: [ { startsAt: { lt: lesson.endsAt } , endsAt: { gt: lesson.startsAt } } ] },
      },
    })
    if (overlaps) {
      revalidatePath('/parent/enrollments')
      // @ts-ignore
      ;(await import('next/navigation')).redirect('/parent/enrollments?conflict=1')
      return
    }
  }
  // Create booking instead of direct enrollment; waits for logoped confirmation
  const holder = `${child?.lastName ?? ''} ${child?.firstName ?? ''}`.trim() || 'Ребёнок'
  await prisma.booking.create({
    data: {
      lessonId,
      childId,
      holder,
      createdBy: (session!.user as any).id as string,
      status: 'ACTIVE',
    }
  })
  // Notify logoped by email if available
  try {
    const logopedEmail = (lesson as any).logoped?.email as string | undefined
    if (logopedEmail) {
      await sendMail({
        to: logopedEmail,
        subject: 'Новая заявка на запись',
        text: `Родитель запросил запись на занятие "${lesson.title}" ${new Date(lesson.startsAt).toLocaleString('ru-RU')}. Подтвердите или отклоните заявку в панели уведомлений.`,
      })
    }
  } catch {}
  revalidatePath('/parent/enrollments')
  // @ts-ignore
  ;(await import('next/navigation')).redirect('/parent/enrollments?bookingRequested=1')
}

export async function cancel(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureParent(session)
  const childId = String(formData.get('childId') || '')
  const lessonId = String(formData.get('lessonId') || '')
  if (!childId || !lessonId) return
  // if enrollment exists, mark cancelled; otherwise do nothing
  await prisma.enrollment.update({
    where: { childId_lessonId: { childId, lessonId } },
    data: { status: 'CANCELLED' },
  }).catch(() => {})
  revalidatePath('/parent/enrollments')
  // @ts-ignore
  ;(await import('next/navigation')).redirect('/parent/enrollments?cancelled=1')
}
