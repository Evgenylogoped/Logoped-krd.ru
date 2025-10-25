"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { sendMail } from '@/lib/mail'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

function ensureLogoped(session: any) {
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','LOGOPED'].includes(role)) throw new Error('Forbidden')
}

export async function regenerateParentPassword(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const parentId = String(formData.get('parentId') || '')
  if (!parentId) throw new Error('Нет parentId')
  const parent = await (prisma as any).parent.findUnique({ where: { id: parentId }, include: { user: true } })
  if (!parent?.user) throw new Error('Родитель не найден')
  const temp = genTempPassword(4)
  const passwordHash = await bcrypt.hash(temp, 10)
  await (prisma as any).user.update({ where: { id: parent.userId }, data: { passwordHash } })
  await (prisma as any).parent.update({
    where: { id: parentId },
    data: {
      visiblePasswordEncrypted: ((): string => {
        try {
          const rawKey = process.env.PARENT_PWD_KEY || ''
          if (!rawKey) return 'plain:' + Buffer.from(temp, 'utf8').toString('base64')
          const key = Buffer.from(rawKey.padEnd(32, '0').slice(0, 32))
          const iv = crypto.randomBytes(12)
          const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
          const enc = Buffer.concat([cipher.update(temp, 'utf8'), cipher.final()])
          const tag = cipher.getAuthTag()
          return Buffer.concat([iv, tag, enc]).toString('base64')
        } catch {
          return 'plain:' + Buffer.from(temp, 'utf8').toString('base64')
        }
      })(),
      visiblePasswordUpdatedAt: new Date(),
    },
  })
  if (parent.user.email) {
    await sendMail({ to: parent.user.email, subject: 'Пароль обновлён', text: `Ваш пароль был обновлён логопедом. Новый временный пароль: ${temp}. Рекомендуем сменить его в настройках.` })
  }
  revalidatePath('/logoped/clients')
}

function normalizeEmail(v: FormDataEntryValue | null) {
  return String(v || '').toLowerCase().trim()
}

function genTempPassword(len = 4) {
  // 4-значный пароль: без похожих символов, только заглавные и цифры
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i=0;i<len;i++) s += chars[Math.floor(Math.random()*chars.length)]
  return s
}

function encryptVisiblePassword(plain: string): string {
  try {
    const rawKey = process.env.PARENT_PWD_KEY || ''
    if (!rawKey) return 'plain:' + Buffer.from(plain, 'utf8').toString('base64')
    const key = Buffer.from(rawKey.padEnd(32, '0').slice(0, 32))
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return Buffer.concat([iv, tag, enc]).toString('base64')
  } catch {
    return 'plain:' + Buffer.from(plain, 'utf8').toString('base64')
  }
}

export async function createParentAndChild(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const logopedId = (session!.user as any).id as string
  // Ensure current logoped exists in DB (after DB reset sessions may persist)
  const meUser = await (prisma as any).user.findUnique({ where: { id: logopedId } })
  if (!meUser) {
    const email = (session!.user as any).email || `restored+${logopedId}@local.test`
    await (prisma as any).user.create({ data: { id: logopedId, email, passwordHash: await bcrypt.hash(crypto.randomBytes(8).toString('hex'), 10), role: 'LOGOPED', name: (session!.user as any).name || 'Логопед' } })
  }
  const email = normalizeEmail(formData.get('email'))
  const fullName = String(formData.get('fullName') || '')
  const phone = String(formData.get('phone') || '')
  const childFirstName = String(formData.get('childFirstName') || '')
  const childLastName = String(formData.get('childLastName') || '')
  if (!email || !childFirstName || !childLastName) throw new Error('Заполните email и ФИО ребёнка')
  const exists = await (prisma as any).user.findUnique({ where: { email } })
  if (exists) throw new Error('Пользователь с таким email уже существует')
  const temp = genTempPassword()
  const passwordHash = await bcrypt.hash(temp, 10)
  const user = await (prisma as any).user.create({ data: { email, passwordHash, role: 'PARENT', name: fullName || null } })
  const parent = await (prisma as any).parent.create({ data: { userId: user.id, fullName: fullName || null, phone: phone || null, isArchived: false } })
  // store visible password for logoped
  await (prisma as any).parent.update({
    where: { id: parent.id },
    data: {
      visiblePasswordEncrypted: encryptVisiblePassword(temp),
      visiblePasswordUpdatedAt: new Date(),
    },
  })
  await (prisma as any).child.create({ data: { parentId: parent.id, logopedId, firstName: childFirstName, lastName: childLastName, isArchived: false } })
  // create set-password token (valid 48h)
  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 48*60*60*1000)
  await (prisma as any).passwordToken.create({ data: { userId: user.id, token, purpose: 'SET', expiresAt } })
  const parentUser = await (prisma as any).user.findUnique({ where: { id: parent.userId } }).catch(() => null)
  if (parentUser?.email) {
    await sendMail({ to: parentUser.email, subject: 'Создана карточка ребёнка', text: `Ваш логопед добавил карточку ребёнка: ${childLastName} ${childFirstName}.` })
  }
  if (email) {
    const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const link = `${base}/auth/set-password/${token}`
    await sendMail({ to: email, subject: 'Аккаунт создан логопедом', text: `Вам создан аккаунт на logoped-krd.\nE-mail: ${email}\nВременный пароль: ${temp}\n\nВы также можете сразу установить свой пароль по ссылке (действует 48 часов):\n${link}` })
  }
  revalidatePath('/logoped/clients')
  redirect('/logoped/clients?op=created')
}

export async function createChildForExistingParent(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const logopedId = (session!.user as any).id as string
  const meUser = await (prisma as any).user.findUnique({ where: { id: logopedId } })
  if (!meUser) {
    const emailSelf = (session!.user as any).email || `restored+${logopedId}@local.test`
    await (prisma as any).user.create({ data: { id: logopedId, email: emailSelf, passwordHash: await bcrypt.hash(crypto.randomBytes(8).toString('hex'), 10), role: 'LOGOPED', name: (session!.user as any).name || 'Логопед' } })
  }
  const email = normalizeEmail(formData.get('email'))
  const childFirstName = String(formData.get('childFirstName') || '')
  const childLastName = String(formData.get('childLastName') || '')
  if (!email || !childFirstName || !childLastName) throw new Error('Заполните поля')
  const user = await (prisma as any).user.findUnique({ where: { email } })
  if (!user || user.role !== 'PARENT') throw new Error('Родитель не найден')
  const parent = await (prisma as any).parent.findUnique({ where: { userId: user.id } })
  if (!parent) throw new Error('Профиль родителя не найден')
  await (prisma as any).parent.update({ where: { id: parent.id }, data: { isArchived: false } })
  await (prisma as any).child.create({ data: { parentId: parent.id, logopedId, firstName: childFirstName, lastName: childLastName, isArchived: false } })
  revalidatePath('/logoped/clients')
  redirect(`/logoped/clients?search=${encodeURIComponent(email)}&op=child_created`)
}

export async function attachExistingChildToMe(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const logopedId = (session!.user as any).id as string
  const meUser = await (prisma as any).user.findUnique({ where: { id: logopedId } })
  if (!meUser) {
    const emailSelf = (session!.user as any).email || `restored+${logopedId}@local.test`
    await (prisma as any).user.create({ data: { id: logopedId, email: emailSelf, passwordHash: await bcrypt.hash(crypto.randomBytes(8).toString('hex'), 10), role: 'LOGOPED', name: (session!.user as any).name || 'Логопед' } })
  }
  const childId = String(formData.get('childId') || '')
  if (!childId) throw new Error('Нет childId')
  const child = await (prisma as any).child.findUnique({ where: { id: childId } })
  if (!child) throw new Error('Ребёнок не найден')
  await (prisma as any).child.update({ where: { id: childId }, data: { logopedId, isArchived: false } })
  const parent = await (prisma as any).parent.update({ where: { id: child.parentId }, data: { isArchived: false } })
  const parentUser = await (prisma as any).user.findUnique({ where: { id: parent.userId } }).catch(() => null)
  if (parentUser?.email) {
    await sendMail({ to: parentUser.email, subject: 'Ребёнок прикреплён к логопеду', text: `Ваш ребёнок (${child.lastName} ${child.firstName}) прикреплён к логопеду.` })
  }
  revalidatePath('/logoped/clients')
  redirect('/logoped/clients?op=attached')
}

export async function searchParent(formData: FormData): Promise<void> {
  const email = normalizeEmail(formData.get('email'))
  redirect(`/logoped/clients?search=${encodeURIComponent(email)}`)
}

export async function approveActivation(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const requestId = String(formData.get('requestId') || '')
  if (!requestId) return
  const currentLogopedId = (session!.user as any).id as string
  const req = await (prisma as any).activationRequest.findUnique({ where: { id: requestId }, include: { parent: { include: { children: true } } } })
  if (!req) return
  if (req.targetLogopedId !== currentLogopedId) return
  // unarchive parent and all children
  await (prisma as any).parent.update({ where: { id: req.parentId }, data: { isArchived: false } })
  // assign children if not assigned, and unarchive all
  for (const ch of req.parent.children as any[]) {
    await (prisma as any).child.update({ where: { id: ch.id }, data: { isArchived: false, logopedId: ch.logopedId ?? currentLogopedId } })
  }
  await (prisma as any).activationRequest.update({ where: { id: requestId }, data: { status: 'APPROVED' } })
  // notify parent via email if available
  const parentUser = await (prisma as any).user.findUnique({ where: { id: req.parent.userId } }).catch(() => null)
  if (parentUser?.email) {
    await sendMail({ to: parentUser.email, subject: 'Активация аккаунта одобрена', text: 'Ваш аккаунт активирован логопедом. Вы можете записываться на занятия.' })
  }
  revalidatePath('/logoped/clients')
  redirect('/logoped/clients?activation=approved')
}

export async function rejectActivation(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const requestId = String(formData.get('requestId') || '')
  if (!requestId) return
  const req = await (prisma as any).activationRequest.findUnique({ where: { id: requestId }, include: { parent: true } })
  await (prisma as any).activationRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } })
  if (req?.parentId) {
    const parent = await (prisma as any).parent.findUnique({ where: { id: req.parentId }, include: { user: true } })
    if (parent?.user?.email) {
      await sendMail({ to: parent.user.email, subject: 'Активация аккаунта отклонена', text: 'Запрос на активацию был отклонён.' })
    }
  }
  revalidatePath('/logoped/clients')
  redirect('/logoped/clients?activation=rejected')
}

export async function archiveChild(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const childId = String(formData.get('childId') || '')
  if (!childId) return
  const child = await (prisma as any).child.update({ where: { id: childId }, data: { isArchived: true } })
  // если у родителя все дети в архиве — помечаем и родителя
  const siblings = await (prisma as any).child.findMany({ where: { parentId: child.parentId } })
  const allArchived = siblings.every((c: any) => c.isArchived)
  if (allArchived) {
    await (prisma as any).parent.update({ where: { id: child.parentId }, data: { isArchived: true } })
  }
  revalidatePath('/logoped/clients')
}

export async function transferChildInsideOrg(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const fromLogopedId = (session!.user as any).id as string
  const childId = String(formData.get('childId') || '')
  const toLogopedId = String(formData.get('toLogopedId') || '')
  if (!childId || !toLogopedId || toLogopedId === fromLogopedId) return
  const [fromUser, toUser, child] = await Promise.all([
    (prisma as any).user.findUnique({ where: { id: fromLogopedId }, include: { branch: { include: { company: true } } } }),
    (prisma as any).user.findUnique({ where: { id: toLogopedId }, include: { branch: { include: { company: true } } } }),
    (prisma as any).child.findUnique({ where: { id: childId }, include: { parent: { include: { user: true } } } }),
  ])
  if (!fromUser || !toUser || !child) throw new Error('Данные не найдены')
  const fromCompanyId = fromUser.branch?.companyId
  const toCompanyId = toUser.branch?.companyId
  if (!fromCompanyId || fromCompanyId !== toCompanyId) throw new Error('Передача возможна только в рамках одной организации')
  await (prisma as any).child.update({ where: { id: childId }, data: { logopedId: toLogopedId, isArchived: false } })
  // уведомления
  const emails: string[] = []
  if (toUser.email) emails.push(toUser.email)
  if (fromUser.email) emails.push(fromUser.email)
  if (child.parent?.user?.email) emails.push(child.parent.user.email)
  if (emails.length) {
    await Promise.all(emails.map(to => sendMail({ to, subject: 'Передача ребёнка внутри организации', text: `Ребёнок ${child.lastName} ${child.firstName} передан ${fromUser.name || fromUser.email} → ${toUser.name || toUser.email}.` })))
  }
  revalidatePath('/logoped/clients')
  redirect('/logoped/clients?transfer=done')
}

export async function requestTransferByEmail(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const fromLogopedId = (session!.user as any).id as string
  const childId = String(formData.get('childId') || '')
  const email = String(formData.get('email') || '').toLowerCase().trim()
  if (!childId || !email) return
  const toUser = await (prisma as any).user.findUnique({ where: { email } })
  if (!toUser || toUser.role !== 'LOGOPED') throw new Error('Логопед по email не найден')
  const child = await (prisma as any).child.findUnique({ where: { id: childId } })
  if (!child) throw new Error('Ребёнок не найден')
  await (prisma as any).transferRequest.create({ data: { childId, fromLogopedId, toLogopedId: toUser.id, status: 'PENDING', createdBy: fromLogopedId } })
  if (toUser.email) {
    await sendMail({ to: toUser.email, subject: 'Запрос на трансфер ребёнка', text: 'К вам поступил запрос на принятие ребёнка. Перейдите в раздел клиенты для подтверждения.' })
  }
  revalidatePath('/logoped/clients')
  redirect('/logoped/clients?transfer=requested')
}

export async function approveTransferRequest(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const toLogopedId = (session!.user as any).id as string
  const requestId = String(formData.get('requestId') || '')
  const req = await (prisma as any).transferRequest.findUnique({ where: { id: requestId } })
  if (!req || req.toLogopedId !== toLogopedId || req.status !== 'PENDING') return
  const child = await (prisma as any).child.update({ where: { id: req.childId }, data: { logopedId: toLogopedId, isArchived: false } })
  await (prisma as any).transferRequest.update({ where: { id: req.id }, data: { status: 'APPROVED' } })
  // уведомления
  const fromUser = await (prisma as any).user.findUnique({ where: { id: req.fromLogopedId } })
  const parent = await (prisma as any).parent.findFirst({ where: { children: { some: { id: child.id } } }, include: { user: true } })
  const toUser = await (prisma as any).user.findUnique({ where: { id: toLogopedId } })
  const emails = [fromUser?.email, parent?.user?.email, toUser?.email].filter(Boolean) as string[]
  if (emails.length) await Promise.all(emails.map(to => sendMail({ to, subject: 'Трансфер ребёнка подтверждён', text: 'Запрос трансфера подтверждён.' })))
  revalidatePath('/logoped/clients')
  redirect(`/logoped/clients?transfer=approved&child=${encodeURIComponent(child.id)}&from=${encodeURIComponent(req.fromLogopedId)}&to=${encodeURIComponent(toLogopedId)}`)
}

export async function rejectTransferRequest(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const toLogopedId = (session!.user as any).id as string
  const requestId = String(formData.get('requestId') || '')
  const req = await (prisma as any).transferRequest.findUnique({ where: { id: requestId } })
  if (!req || req.toLogopedId !== toLogopedId || req.status !== 'PENDING') return
  await (prisma as any).transferRequest.update({ where: { id: req.id }, data: { status: 'REJECTED' } })
  const fromUser = await (prisma as any).user.findUnique({ where: { id: req.fromLogopedId } })
  if (fromUser?.email) await sendMail({ to: fromUser.email, subject: 'Трансфер ребёнка отклонён', text: 'Запрос трансфера был отклонён.' })
  revalidatePath('/logoped/clients')
}

export async function restoreChild(formData: FormData): Promise<void> {
  const session = await getServerSession(authOptions)
  ensureLogoped(session)
  const childId = String(formData.get('childId') || '')
  if (!childId) return
  const child = await (prisma as any).child.update({ where: { id: childId }, data: { isArchived: false } })
  // Разархивируем родителя (аккаунт снова активен)
  await (prisma as any).parent.update({ where: { id: child.parentId }, data: { isArchived: false } })
  revalidatePath('/logoped/clients')
}
