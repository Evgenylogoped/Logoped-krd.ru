"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function updateProfile(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const userId = (session.user as any).id as string
  const name = String(formData.get('name') || '').trim() || null
  const city = String(formData.get('city') || '').trim() || null
  const timeZone = String(formData.get('timeZone') || '').trim() || null
  const phone = String(formData.get('phone') || '').trim() || null
  const profession = String(formData.get('profession') || '').trim() || null
  const experienceYearsStr = String(formData.get('experienceYears') || '').trim()
  const experienceYears = experienceYearsStr ? Number(experienceYearsStr) : null
  const specialization = String(formData.get('specialization') || '').trim() || null
  const about = String(formData.get('about') || '').trim() || null
  const education = String(formData.get('education') || '').trim() || null
  // New UX: show* checkboxes (we may have hidden off + checkbox on). Use getAll to detect 'on'.
  const aboutVals = formData.getAll('showAboutToParents').map(v => String(v))
  const eduVals = formData.getAll('showEducationToParents').map(v => String(v))
  const newShowAboutProvided = aboutVals.length > 0
  const newShowEducationProvided = eduVals.length > 0
  const showAboutToParents = aboutVals.includes('on')
  const showEducationToParents = eduVals.includes('on')
  const oldHideAbout = String(formData.get('hideAboutFromParents') || '') === 'on'
  const oldHideEducation = String(formData.get('hideEducationFromParents') || '') === 'on'
  const hideAboutFromParents = newShowAboutProvided ? !showAboutToParents : oldHideAbout
  const hideEducationFromParents = newShowEducationProvided ? !showEducationToParents : oldHideEducation
  const address = String(formData.get('address') || '').trim() || null
  const lessonPriceStr = String(formData.get('lessonPrice') || '').trim()
  const lessonPrice = lessonPriceStr ? Number(lessonPriceStr) : null
  const showPriceToParents = String(formData.get('showPriceToParents') || '') === 'on'
  const isOnline = String(formData.get('isOnline') || '') === 'on'
  const isOffline = String(formData.get('isOffline') || '') === 'on'
  const clearBranch = String(formData.get('clearBranch') || '') === 'on'

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('User not found')

  const data: any = { name: name || undefined, city: city || undefined, timeZone: timeZone || undefined }
  if ((user as any).role === 'LOGOPED') {
    data.profession = profession || undefined
    data.experienceYears = typeof experienceYears === 'number' && !Number.isNaN(experienceYears) ? experienceYears : undefined
    data.specialization = specialization || undefined
    data.about = about || undefined
    data.education = education || undefined
    data.hideEducationFromParents = hideEducationFromParents
    data.hideAboutFromParents = hideAboutFromParents
    data.address = address || undefined
    data.lessonPrice = typeof lessonPrice === 'number' && !Number.isNaN(lessonPrice) ? lessonPrice : undefined
    data.showPriceToParents = showPriceToParents
    data.isOnline = isOnline
    data.isOffline = isOffline
    if (clearBranch) data.branchId = null
  }
  // убрать undefined, чтобы Prisma не получал ключи с undefined
  Object.keys(data).forEach((k) => {
    if ((data as any)[k] === undefined) delete (data as any)[k]
  })
  await prisma.user.update({ where: { id: userId }, data })

  if (user.role === 'PARENT') {
    // parent profile extras
    const parent = await prisma.parent.findUnique({ where: { userId } })
    if (parent) {
      await prisma.parent.update({ where: { id: parent.id }, data: { fullName: name || parent.fullName || undefined, phone: phone || undefined } as any })
    }
  }
  revalidatePath('/settings/profile')
  redirect('/settings/profile?saved=1')
}

export async function uploadAvatar(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const userId = (session.user as any).id as string
  const file = formData.get('file') as File | null
  if (!file) return
  const mime = (file as any).type || ''
  const size = (file as any).size || 0
  if (!mime.startsWith('image/') || size > 10 * 1024 * 1024) {
    revalidatePath('/settings/profile')
    redirect('/settings/profile?photoError=1')
  }
  const array = await file.arrayBuffer()
  const buffer = Buffer.from(array)
  const { promises: fs } = await import('fs')
  const path = await import('path')
  const dir = path.join(process.cwd(), 'public', 'uploads', 'avatars')
  await fs.mkdir(dir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g,'-')
  const safe = ((file as any).name || 'avatar.jpg').replace(/[^a-zA-Z0-9._-]+/g,'_')
  const name = `${userId}_${ts}_${safe}`
  const full = path.join(dir, name)
  await fs.writeFile(full, buffer)
  const url = `/uploads/avatars/${name}`
  await prisma.user.update({ where: { id: userId }, data: { image: url } })
  revalidatePath('/settings/profile')
  redirect('/settings/profile?saved=1')
}

export async function deleteAvatar() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const userId = (session.user as any).id as string
  await prisma.user.update({ where: { id: userId }, data: { image: null } })
  revalidatePath('/settings/profile')
  redirect('/settings/profile?saved=1')
}

export async function updateTheme(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const userId = (session.user as any).id as string
  const theme = String(formData.get('theme') || '').trim() || null
  const quick = String(formData.get('quick') || '').trim()
  const source = String(formData.get('source') || '').trim()
  try {
    await prisma.user.update({ where: { id: userId }, data: { theme } as any })
  } catch (e) {
    console.warn('updateTheme: prisma.user.update failed, fallback to client-only theme', e)
  }
  // Если переключение пришло из навбара/быстрого тумблера — не редиректим и не рефрешим страницу
  if (quick === '1' || source === 'navbar') {
    return
  }
  revalidatePath('/settings/profile')
  redirect('/settings/profile?saved=1')
}
