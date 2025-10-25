"use server"
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mail'
import crypto from 'crypto'

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (!email) throw new Error('Укажите email')
  const user = await prisma.user.findUnique({ where: { email } })
  // Чтобы не раскрывать наличие/отсутствие пользователя, всегда отвечаем одинаково
  if (!user) return
  const token = crypto.randomBytes(24).toString('hex')
  const expiresAt = new Date(Date.now() + 2*60*60*1000) // 2 часа
  await prisma.passwordToken.create({ data: { userId: user.id, token, purpose: 'RESET', expiresAt } })
  const base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const link = `${base}/auth/reset/${token}`
  if (user.email) {
    await sendMail({ to: user.email, subject: 'Восстановление пароля', text: `Для восстановления пароля перейдите по ссылке:\n${link}\n\nСсылка действует 2 часа.` })
  }
}
