import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { Plan } from '@/lib/subscriptions'

function mapPrice(plan: Plan, duration: 'month'|'year'): string | null {
  const envs: Record<string, string | undefined> = {
    PRO_MONTH: process.env.STRIPE_PRICE_PRO_MONTH,
    PRO_YEAR: process.env.STRIPE_PRICE_PRO_YEAR,
    PRO_PLUS_MONTH: process.env.STRIPE_PRICE_PRO_PLUS_MONTH,
    PRO_PLUS_YEAR: process.env.STRIPE_PRICE_PRO_PLUS_YEAR,
    MAX_MONTH: process.env.STRIPE_PRICE_MAX_MONTH,
    MAX_YEAR: process.env.STRIPE_PRICE_MAX_YEAR,
  }
  if (plan === 'pro') return duration==='month' ? (envs.PRO_MONTH||null) : (envs.PRO_YEAR||null)
  if (plan === 'pro_plus') return duration==='month' ? (envs.PRO_PLUS_MONTH||null) : (envs.PRO_PLUS_YEAR||null)
  if (plan === 'max') return duration==='month' ? (envs.MAX_MONTH||null) : (envs.MAX_YEAR||null)
  return null
}

async function createCheckoutSession(targetUserId: string, plan: Plan, duration: 'month'|'year') {
  const secret = process.env.STRIPE_SECRET_KEY
  if (!secret) return { ok: false, status: 501, body: { ok: false, reason: 'not_configured', message: 'STRIPE_SECRET_KEY не задан' } }

  const price = mapPrice(plan, duration)
  if (!price) return { ok: false, status: 400, body: { ok: false, reason: 'bad_request', message: 'Неверная комбинация плана/периода или не задан PRICE_ID' } }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(secret, { apiVersion: '2024-06-20' as any })
  const success = `${process.env.NEXT_PUBLIC_BASE_URL || ''}/settings/billing?upgraded=1`
  const cancel = `${process.env.NEXT_PUBLIC_BASE_URL || ''}/settings/billing?cancel=1`
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price, quantity: 1 }],
    success_url: success,
    cancel_url: cancel,
    metadata: { userId: targetUserId, plan, duration },
  })
  return { ok: true, url: session.url }
}

export async function GET(req: Request) {
  const session: any = await getServerSession(authOptions as any)
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })
  const actorId = (session.user as any).id as string
  const actorRole = (session.user as any).role as string
  const url = new URL(req.url)
  const plan = (url.searchParams.get('plan') || 'pro').toLowerCase() as Plan
  const duration = (url.searchParams.get('duration') || 'month').toLowerCase() as 'month'|'year'|'forever'
  const targetUserId = url.searchParams.get('targetUserId') || actorId

  // Бесплатные планы не идут через оплату
  if (plan === 'beta' || plan === 'free') {
    return NextResponse.json({ ok: false, reason: 'free_plan', message: 'Beta/Free не оформляются через оплату' }, { status: 400 })
  }
  // Forever не через Stripe — это ручная активация админом
  if (duration === 'forever') {
    return NextResponse.json({ ok: false, reason: 'manual_only', message: 'Бессрочно активируется только вручную админом' }, { status: 400 })
  }
  // Только админ может создавать сессию за другого пользователя
  if (targetUserId !== actorId && !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(actorRole)) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  // Mock
  const mock = String(process.env.MOCK_BILLING || '').toLowerCase()
  const isMock = mock === '1' || mock === 'true'
  if (isMock) {
    const now = new Date()
    const end = new Date(now.getTime() + (duration==='year' ? 365 : 30)*24*60*60*1000)
    const existing = await (prisma as any).subscription.findFirst({ where: { userId: targetUserId }, orderBy: { createdAt: 'desc' } })
    if (existing) {
      await (prisma as any).subscription.update({ where: { id: existing.id }, data: { plan, status: 'active', currentPeriodStart: now, currentPeriodEnd: end } })
    } else {
      await (prisma as any).subscription.create({ data: { userId: targetUserId, plan, status: 'active', currentPeriodStart: now, currentPeriodEnd: end } })
    }
    try { await prisma.auditLog.create({ data: { action: 'BILLING_CHECKOUT_MOCK_UPGRADE', payload: JSON.stringify({ targetUserId, plan, duration }), actorId } }) } catch {}
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/settings/billing?upgraded=1`)
  }

  try { await prisma.auditLog.create({ data: { action: 'BILLING_CHECKOUT_START', payload: JSON.stringify({ targetUserId, plan, duration }), actorId } }) } catch {}
  const res = await createCheckoutSession(targetUserId, plan, duration)
  if ((res as any).ok && (res as any).url) {
    return NextResponse.redirect((res as any).url)
  }
  return NextResponse.json((res as any).body || { ok: false }, { status: (res as any).status || 500 })
}

export async function POST(req: Request) {
  // Сохраняем совместимость: POST без параметров ведёт себя как GET с pro/month для текущего пользователя
  const url = new URL(req.url)
  if (!url.searchParams.get('plan')) url.searchParams.set('plan','pro')
  if (!url.searchParams.get('duration')) url.searchParams.set('duration','month')
  return GET(new Request(url.toString(), { method: 'GET', headers: (req as any).headers }))
}
