"use server"
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcrypt'
import { verifyTurnstile } from '@/lib/antibot'
import { redirect } from 'next/navigation'
import { sendMail } from '@/lib/mail'
import { isValidCity, normalizeCity } from '@/lib/cities'

function normalizeEmail(v: FormDataEntryValue | null) {
  return String(v || '').toLowerCase().trim()
}

export async function linkExistingLogoped(formData: FormData) {
  const email = normalizeEmail(formData.get('email'))
  const name = String(formData.get('name') || '')
  const phoneRaw = String(formData.get('phone') || '')
  const cityRaw = String(formData.get('city') || '')
  const agree = String(formData.get('agree') || '') === 'on'

  if (!email) throw new Error('Email обязателен')
  const city = cityRaw.trim()
  if (!city || !isValidCity(city)) throw new Error('Выберите город из списка')
  if (!agree) throw new Error('Необходимо согласие на обработку персональных данных')

  function normalizePhoneToPlus7(v: string): string | null {
    const d = (v || '').replace(/\D/g, '')
    if (!d) return null
    let n = d
    if (n.startsWith('8')) n = '7' + n.slice(1)
    if (!n.startsWith('7')) n = '7' + n
    n = n.substring(0, 11)
    if (n.length !== 11) return null
    return '+' + n
  }
  const phone = phoneRaw ? normalizePhoneToPlus7(phoneRaw) : null
  if (phoneRaw && !phone) throw new Error('Телефон должен быть в формате +7XXXXXXXXXX')

  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) throw new Error('Пользователь не найден')

  // Привязываем роль LOGOPED и обновляем город/телефон/имя (не меняем пароль)
  await prisma.user.update({
    where: { email },
    data: {
      role: 'LOGOPED',
      name: name || user.name,
      city: normalizeCity(city),
      ...(phone ? { phone } : {}),
    } as any,
  })

  // Стартуем бета-подписку, если её нет
  try {
    const has = await (prisma as any).subscription.findFirst({ where: { userId: user.id, plan: 'beta' } })
    if (!has) await (prisma as any).subscription.create({ data: { userId: user.id, plan: 'beta' } })
  } catch {}

  redirect('/login?linked=1')
}

export async function registerLogoped(formData: FormData) {
  const email = normalizeEmail(formData.get('email'))
  const password = String(formData.get('password') || '')
  const name = String(formData.get('name') || '')
  const phoneRaw = String(formData.get('phone') || '')
  const cityRaw = String(formData.get('city') || '')
  const tsToken = String(formData.get('cf-turnstile-response') || '')
  const ip = (formData.get('remoteIp') as string) || undefined
  const agree = String(formData.get('agree') || '') === 'on'

  const check = await verifyTurnstile(tsToken, ip)
  if (!check.ok) throw new Error('Антибот-проверка не пройдена')
  if (!email || !password) throw new Error('Укажите email и пароль')
  // city required and must be from list
  const city = cityRaw.trim()
  if (!city || !isValidCity(city)) throw new Error('Выберите город из списка')
  if (!agree) throw new Error('Необходимо согласие на обработку персональных данных')

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) {
    // Отправляем на экран привязки существующего пользователя
    redirect(`/register/logoped?exists=1&email=${encodeURIComponent(email)}`)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const now = new Date()
  const betaExpiresAt = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000)

  // Optional phone normalization for logoped
  function normalizePhoneToPlus7(v: string): string | null {
    const d = (v || '').replace(/\D/g, '')
    if (!d) return null
    let n = d
    if (n.startsWith('8')) n = '7' + n.slice(1)
    if (!n.startsWith('7')) n = '7' + n
    n = n.substring(0, 11)
    if (n.length !== 11) return null
    return '+' + n
  }
  const phone = phoneRaw ? normalizePhoneToPlus7(phoneRaw) : null
  if (phoneRaw && !phone) throw new Error('Телефон должен быть в формате +7XXXXXXXXXX')

  let user
  try {
    user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        passwordHash,
        role: 'LOGOPED',
        city: normalizeCity(city),
        phone: phone || undefined,
        betaStartedAt: now,
        betaExpiresAt,
        activatedForever: false,
      } as any,
    })
  } catch (e: any) {
    const msg = String(e?.message || e)
    if (msg.includes('Unknown argument `phone`')) {
      // column not yet in DB, retry without phone
      user = await prisma.user.create({
        data: {
          email,
          name: name || null,
          passwordHash,
          role: 'LOGOPED',
          city: normalizeCity(city),
          betaStartedAt: now,
          betaExpiresAt,
          activatedForever: false,
        },
      })
    } else {
      throw e
    }
  }
  // Стартуем бета-подписку (15 дней) в новой модели подписок
  try {
    await (prisma as any).subscription.create({ data: { userId: user.id, plan: 'beta' } })
    // send verification email
    try {
      const token = (await import('crypto')).randomBytes(24).toString('hex')
      await (prisma as any).verificationToken.create({ data: { identifier: email, token, expires: new Date(Date.now()+7*24*60*60*1000) } })
      const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || ''
      const link = `${base}/auth/verify/${token}`
      await sendMail({ to: email, subject: 'Подтверждение email', text: `Для подтверждения email перейдите по ссылке:\n${link}` })
    } catch {}
  } catch {}
  // уведомление бухгалтеру/админу
  const accountingEmail = process.env.ACCOUNTING_EMAIL || process.env.SMTP_USER || ''
  if (accountingEmail) {
    await sendMail({ to: accountingEmail, subject: 'Новый логопед зарегистрирован', text: `Email: ${email}\nИмя: ${name || '—'}` })
  }
  redirect('/login?reg=beta')
}

export async function registerParent(formData: FormData) {
  const email = normalizeEmail(formData.get('email'))
  const password = String(formData.get('password') || '')
  const fullName = String(formData.get('fullName') || '')
  const phoneRaw = String(formData.get('phone') || '')
  const cityRaw = String(formData.get('city') || '')
  const tsToken = String(formData.get('cf-turnstile-response') || '')
  const ip = (formData.get('remoteIp') as string) || undefined
  const agree = String(formData.get('agree') || '') === 'on'

  const check = await verifyTurnstile(tsToken, ip)
  function fail(msg: string) {
    return redirect(`/register/parent?err=${encodeURIComponent(msg)}`)
  }
  if (!check.ok) return fail('Антибот-проверка не пройдена')
  if (!email || !password) return fail('Укажите email и пароль')
  if (!agree) return fail('Необходимо согласие на обработку персональных данных')

  // Validate city
  const city = cityRaw.trim()
  if (!city || !isValidCity(city)) return fail('Выберите город из списка')

  // Normalize phone to +7XXXXXXXXXX (digits only validation)
  function normalizePhoneToPlus7(v: string): string | null {
    const d = (v || '').replace(/\D/g, '')
    if (!d) return null
    let n = d
    if (n.startsWith('8')) n = '7' + n.slice(1)
    if (!n.startsWith('7')) n = '7' + n
    n = n.substring(0, 11)
    if (n.length !== 11) return null
    return '+' + n
  }
  const phone = normalizePhoneToPlus7(phoneRaw)
  if (!phone) return fail('Телефон должен быть в формате +7XXXXXXXXXX')

  const exists = await prisma.user.findUnique({ where: { email } })
  if (exists) return fail('Пользователь с таким email уже существует')

  const passwordHash = await bcrypt.hash(password, 10)
  const user = await prisma.user.create({
    data: {
      email, passwordHash, role: 'PARENT', city: normalizeCity(city),
    },
  })
  await prisma.parent.create({ data: { userId: user.id, fullName: fullName || null, phone, isArchived: true } })
  redirect('/login?reg=ok')
}
