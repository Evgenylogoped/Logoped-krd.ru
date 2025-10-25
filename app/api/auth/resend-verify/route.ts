import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendMail } from '@/lib/mail'
import crypto from 'crypto'

export async function POST(req: Request) {
  try {
    const { email } = await req.json().catch(() => ({})) as any
    const e = String(email || '').toLowerCase().trim()
    if (!e) return NextResponse.json({ ok: false, error: 'email required' }, { status: 400 })
    const user = await prisma.user.findUnique({ where: { email: e } })
    if (!user) return NextResponse.json({ ok: true })
    // if already verified, noop
    if ((user as any).emailVerifiedAt) return NextResponse.json({ ok: true })
    const token = crypto.randomBytes(24).toString('hex')
    const expires = new Date(Date.now() + 7*24*60*60*1000)
    await (prisma as any).verificationToken.create({ data: { identifier: e, token, expires } })
    const base = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || ''
    const link = `${base}/auth/verify/${token}`
    await sendMail({ to: e, subject: 'Подтверждение email', text: `Для подтверждения email перейдите по ссылке:\n${link}` })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
