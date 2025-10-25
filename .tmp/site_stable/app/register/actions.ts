"use server"
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcrypt'
import { verifyTurnstile } from '@/lib/antibot'
import { redirect } from 'next/navigation'
import { sendMail } from '@/lib/mail'

function normalizeEmail(v: FormDataEntryValue | null) {
  return String(v || '').toLowerCase().trim()
}

export async function registerLogoped(formData: FormData) {
  const email = normalizeEmail(formData.get('email'))
  const password = String(formData.get('password') || '')
  const name = String(formData.get('name') || '')
  const tsToken = String(formData.get('cf-turnstile-response') || '')
  const ip = (formData.get('remoteIp') as string) || undefined
  const agree = String(formData.get('agree') || '') === 'on'

  const check = await verifyTurnstile(tsToken, ip)
  if (!check.ok) throw new Error('Антибот-проверка не пройдена')
  if (!email || !password) throw new Error('Укажите email и пароль')
  if (!agree) throw new Error('Необходимо согласие на обработку персональных данных')

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) throw new Error('Пользователь с таким email уже существует')

  const passwordHash = await bcrypt.hash(password, 10)
  const now = new Date()
  const betaExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  await prisma.user.create({
    data: {
      email,
      name: name || null,
      passwordHash,
      role: 'LOGOPED',
      betaStartedAt: now,
      betaExpiresAt,
      activatedForever: false,
    },
  })
  // уведомление бухгалтеру/админу
  const accountingEmail = process.env.ACCOUNTING_EMAIL || process.env.SMTP_USER || ''
  if (accountingEmail) {
    await sendMail({ to: accountingEmail, subject: 'Новый логопед зарегистрирован', text: `Email: ${email}\nИмя: ${name || '—'}` })
  }
  redirect('/login?reg=ok')
}

export async function registerParent(formData: FormData) {
  const email = normalizeEmail(formData.get('email'))
  const password = String(formData.get('password') || '')
  const fullName = String(formData.get('fullName') || '')
  const phone = String(formData.get('phone') || '')
  const tsToken = String(formData.get('cf-turnstile-response') || '')
  const ip = (formData.get('remoteIp') as string) || undefined
  const agree = String(formData.get('agree') || '') === 'on'

  const check = await verifyTurnstile(tsToken, ip)
  if (!check.ok) throw new Error('Антибот-проверка не пройдена')
  if (!email || !password) throw new Error('Укажите email и пароль')
  if (!agree) throw new Error('Необходимо согласие на обработку персональных данных')

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) throw new Error('Пользователь с таким email уже существует')

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: {
      email, passwordHash, role: 'PARENT',
    },
  })
  await prisma.parent.create({ data: { userId: user.id, fullName: fullName || null, phone: phone || null, isArchived: true } })
  redirect('/login?reg=ok')
}
