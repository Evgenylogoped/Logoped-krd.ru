import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import type StripeType from 'stripe'

function mapPriceIdToPlan(priceId?: string | null): 'pro'|'pro_plus'|'max'|'free'|'beta'|null {
  if (!priceId) return null
  const env = {
    PRO_MONTH: process.env.STRIPE_PRICE_PRO_MONTH,
    PRO_YEAR: process.env.STRIPE_PRICE_PRO_YEAR,
    PRO_PLUS_MONTH: process.env.STRIPE_PRICE_PRO_PLUS_MONTH,
    PRO_PLUS_YEAR: process.env.STRIPE_PRICE_PRO_PLUS_YEAR,
    MAX_MONTH: process.env.STRIPE_PRICE_MAX_MONTH,
    MAX_YEAR: process.env.STRIPE_PRICE_MAX_YEAR,
  }
  if (priceId === env.PRO_MONTH || priceId === env.PRO_YEAR) return 'pro'
  if (priceId === env.PRO_PLUS_MONTH || priceId === env.PRO_PLUS_YEAR) return 'pro_plus'
  if (priceId === env.MAX_MONTH || priceId === env.MAX_YEAR) return 'max'
  return null
}

async function upsertBillingCustomer(userId: string, customerId: string) {
  try {
    const existing = await (prisma as any).billingCustomer.findFirst({ where: { userId, provider: 'stripe' } })
    if (existing) {
      await (prisma as any).billingCustomer.update({ where: { id: existing.id }, data: { customerId, status: 'active' } })
    } else {
      await (prisma as any).billingCustomer.create({ data: { userId, provider: 'stripe', customerId, status: 'active' } })
    }
  } catch {}
}

async function upsertSubscription(userId: string, plan: string, status: string, start?: number | null, end?: number | null) {
  const startDt = start ? new Date(start * 1000) : null
  const endDt = end ? new Date(end * 1000) : null
  const current = await (prisma as any).subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })
  if (current) {
    await (prisma as any).subscription.update({
      where: { id: current.id },
      data: { plan, status, currentPeriodStart: startDt ?? current.currentPeriodStart, currentPeriodEnd: endDt },
    })
  } else {
    await (prisma as any).subscription.create({ data: { userId, plan, status, currentPeriodStart: startDt ?? new Date(), currentPeriodEnd: endDt ?? null } })
  }
}

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  const apiKey = process.env.STRIPE_SECRET_KEY
  if (!secret || !apiKey) return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 501 })

  const rawBody = await req.text()
  const sig = (req.headers.get('stripe-signature') || '')
  const Stripe = (await import('stripe')).default as unknown as typeof StripeType
  const stripe = new Stripe(apiKey, { apiVersion: '2024-06-20' as any })

  let event: StripeType.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret)
  } catch (err: any) {
    await prisma.auditLog.create({ data: { action: 'BILLING_WEBHOOK_VERIFY_FAIL', payload: String(err?.message || err), actorId: null } })
    return new NextResponse('Bad signature', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any
        const userId = session?.metadata?.userId as string | undefined
        const plan = (session?.metadata?.plan as string | undefined)?.toLowerCase() as 'pro'|'pro_plus'|'max'|undefined
        if (!userId || !plan) break
        const customerId = (typeof session.customer === 'string' ? session.customer : session.customer?.id) as string | undefined
        if (customerId) await upsertBillingCustomer(userId, customerId)
        const subId = (typeof session.subscription === 'string' ? session.subscription : session.subscription?.id) as string | undefined
        if (subId) {
          const sub: any = await stripe.subscriptions.retrieve(subId)
          const priceId = sub?.items?.data?.[0]?.price?.id as string | undefined
          const mappedPlan = mapPriceIdToPlan(priceId) || plan
          await upsertSubscription(userId, mappedPlan, sub?.status || 'active', sub?.current_period_start || null, sub?.current_period_end || null)
          try { await (prisma as any).pushEventQueue.create({ data: { userId, type: 'PAYMENT_STATUS', payload: { title: 'Оплата успешна', body: `Тариф: ${mappedPlan}`, url: '/after-login' }, scheduledAt: new Date(), attempt: 0 } }) } catch {}
        } else {
          // Fallback: 30 дней от сегодня
          const now = Math.floor(Date.now()/1000)
          await upsertSubscription(userId, plan, 'active', now, now + 30*24*60*60)
          try { await (prisma as any).pushEventQueue.create({ data: { userId, type: 'PAYMENT_STATUS', payload: { title: 'Оплата успешна', body: `Тариф: ${plan}`, url: '/after-login' }, scheduledAt: new Date(), attempt: 0 } }) } catch {}
        }
        break
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
      case 'customer.subscription.created': {
        const sub = event.data.object as any
        const customerId = (typeof sub.customer === 'string' ? sub.customer : sub.customer?.id) as string | undefined
        if (!customerId) break
        const bc = await (prisma as any).billingCustomer.findFirst({ where: { provider: 'stripe', customerId } })
        const userId = bc?.userId as string | undefined
        if (!userId) break
        const priceId = sub?.items?.data?.[0]?.price?.id as string | undefined
        const plan = mapPriceIdToPlan(priceId) || 'pro'
        await upsertSubscription(userId, plan, sub?.status || 'active', sub?.current_period_start || null, sub?.current_period_end || null)
        try {
          const st = String(sub?.status || 'active')
          const title = st === 'canceled' || st === 'incomplete_expired' ? 'Подписка отменена' : 'Статус подписки обновлён'
          const body = `Тариф: ${plan}, статус: ${st}`
          await (prisma as any).pushEventQueue.create({ data: { userId, type: 'PAYMENT_STATUS', payload: { title, body, url: '/after-login' }, scheduledAt: new Date(), attempt: 0 } })
        } catch {}
        break
      }
      default: {
        // noop, but keep audit for visibility
        try { await prisma.auditLog.create({ data: { action: 'BILLING_WEBHOOK_EVENT', payload: JSON.stringify({ type: event.type }), actorId: null } }) } catch {}
      }
    }
  } catch (err: any) {
    try { await prisma.auditLog.create({ data: { action: 'BILLING_WEBHOOK_ERROR', payload: String(err?.message || err), actorId: null } }) } catch {}
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
