"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcrypt'
import crypto from 'crypto'

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

export async function changePassword(formData: FormData) {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new Error('Unauthorized')
  const userId = (session.user as any).id as string
  const current = String(formData.get('current') || '')
  const next = String(formData.get('next') || '')
  const confirm = String(formData.get('confirm') || '')
  if (!next || next.length < 8) throw new Error('Пароль должен быть не короче 8 символов')
  if (next !== confirm) throw new Error('Пароли не совпадают')
  const user = await (prisma as any).user.findUnique({ where: { id: userId } })
  if (!user) throw new Error('User not found')
  if (user.passwordHash) {
    const ok = await bcrypt.compare(current, user.passwordHash)
    if (!ok) throw new Error('Текущий пароль неверен')
  } else {
    // если раньше пароля не было, разрешим задать без проверки текущего
  }
  const passwordHash = await bcrypt.hash(next, 10)
  await (prisma as any).user.update({ where: { id: userId }, data: { passwordHash } })
  // Если пользователь — родитель, обновим видимый пароль у Parent
  if ((user as any).role === 'PARENT') {
    const parent = await (prisma as any).parent.findUnique({ where: { userId } })
    if (parent) {
      await (prisma as any).parent.update({
        where: { id: parent.id },
        data: {
          visiblePasswordEncrypted: encryptVisiblePassword(next),
          visiblePasswordUpdatedAt: new Date(),
        },
      })
    }
  }
}
