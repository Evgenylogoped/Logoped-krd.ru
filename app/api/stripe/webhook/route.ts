import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false, reason: 'not_configured', message: 'Stripe webhook не настроен (STRIPE_WEBHOOK_SECRET отсутствует).' }, { status: 501 })
  }
  // MVP-заглушка: пока не валидируем подпись без stripe sdk
  try {
    await prisma.auditLog.create({ data: { action: 'BILLING_WEBHOOK_RECEIVED', payload: await req.text() } })
  } catch {}
  return NextResponse.json({ ok: true })
}
