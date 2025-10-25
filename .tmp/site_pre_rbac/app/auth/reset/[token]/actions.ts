"use server"
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcrypt'

export async function resetPasswordWithToken(formData: FormData) {
  const token = String(formData.get('token') || '')
  const password = String(formData.get('password') || '')
  const confirm = String(formData.get('confirm') || '')
  if (!token) throw new Error('Токен отсутствует')
  if (!password || password.length < 8) throw new Error('Пароль должен быть не короче 8 символов')
  if (password !== confirm) throw new Error('Пароли не совпадают')
  const rec = await (prisma as any).passwordToken.findUnique({ where: { token } })
  if (!rec) throw new Error('Неверный токен')
  if (rec.purpose !== 'RESET') throw new Error('Неверная цель токена')
  if (rec.usedAt) throw new Error('Токен уже использован')
  if (new Date(rec.expiresAt).getTime() < Date.now()) throw new Error('Срок действия токена истёк')
  const passwordHash = await bcrypt.hash(password, 10)
  await (prisma as any).user.update({ where: { id: rec.userId }, data: { passwordHash } })
  await (prisma as any).passwordToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } })
}
