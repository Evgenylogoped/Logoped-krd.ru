"use server"
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import type { Plan } from '@/lib/subscriptions'

export async function setUserPlanAdmin(formData: FormData) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) throw new Error('forbidden')

  const targetUserId = String(formData.get('userId') || '').trim()
  const rawPlan = String(formData.get('plan') || 'free').trim().toLowerCase()
  const plan: Plan = (['beta','free','pro','pro_plus','max'].includes(rawPlan) ? rawPlan : 'free') as Plan
  const rawDuration = String(formData.get('duration') || 'month').trim()
  const duration: 'month'|'year'|'forever' = (['month','year','forever'].includes(rawDuration) ? rawDuration : 'month') as any

  const now = new Date()
  let end: Date | null = null
  if (duration === 'month') end = new Date(now.getTime() + 30*24*60*60*1000)
  else if (duration === 'year') end = new Date(now.getTime() + 365*24*60*60*1000)
  else end = null

  // upsert subscription for target user
  const current = await (prisma as any).subscription.findFirst({ where: { userId: targetUserId }, orderBy: { createdAt: 'desc' } })
  if (current) {
    await (prisma as any).subscription.update({
      where: { id: current.id },
      data: { plan, status: 'active', currentPeriodStart: now, currentPeriodEnd: end },
    })
  } else {
    await (prisma as any).subscription.create({
      data: { userId: targetUserId, plan, status: 'active', currentPeriodStart: now, currentPeriodEnd: end },
    })
  }
  revalidatePath('/admin/subscriptions')
}

// Сохранение цен тарифов (хранение через AuditLog последней версии)
export async function setPlanPrices(formData: FormData) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) throw new Error('forbidden')

  function num(name: string) {
    const v = String(formData.get(name) || '').replace(/[^0-9.\-]/g, '').trim()
    let n = Number(v)
    if (!isFinite(n) || n < 0) n = 0
    // ограничим верхний предел разумно
    if (n > 1_000_000) n = 1_000_000
    // округлим до целых рублей
    n = Math.round(n)
    return n
  }

  // capture raw inputs for UX hints
  const raw = {
    pro: { month: String(formData.get('pro_month')||''), year: String(formData.get('pro_year')||''), forever: String(formData.get('pro_forever')||'') },
    pro_plus: { month: String(formData.get('pro_plus_month')||''), year: String(formData.get('pro_plus_year')||''), forever: String(formData.get('pro_plus_forever')||'') },
    max: { month: String(formData.get('max_month')||''), year: String(formData.get('max_year')||''), forever: String(formData.get('max_forever')||'') },
  }
  const payload = {
    pro: { month: num('pro_month'), year: num('pro_year'), forever: num('pro_forever') || null },
    pro_plus: { month: num('pro_plus_month'), year: num('pro_plus_year'), forever: num('pro_plus_forever') || null },
    max: { month: num('max_month'), year: num('max_year'), forever: num('max_forever') || null },
  }
  // compute clamp hints
  const hints: string[] = []
  const clampFields: Set<string> = new Set()
  ;(['pro','pro_plus','max'] as const).forEach(k => {
    const r = raw[k]
    const p = (payload as any)[k]
    if (r.month && Number(r.month.replace(/[^0-9.-]/g,'')) < 0 && p.month === 0) { hints.push(`${k}: месяц → 0`); clampFields.add(`${k}_month`) }
    if (r.year && Number(r.year.replace(/[^0-9.-]/g,'')) < 0 && p.year === 0) { hints.push(`${k}: год → 0`); clampFields.add(`${k}_year`) }
    if (r.forever && Number(r.forever.replace(/[^0-9.-]/g,'')) < 0 && p.forever === null) { hints.push(`${k}: навсегда → пусто`); clampFields.add(`${k}_forever`) }
    // upper bounds
    if (Number(r.month.replace(/[^0-9.-]/g,'')) > 1_000_000 && p.month === 1_000_000) { hints.push(`${k}: месяц ограничен 1 000 000`); clampFields.add(`${k}_month`) }
    if (Number(r.year.replace(/[^0-9.-]/g,'')) > 1_000_000 && p.year === 1_000_000) { hints.push(`${k}: год ограничен 1 000 000`); clampFields.add(`${k}_year`) }
  })

  try {
    await prisma.auditLog.create({ data: { action: 'BILLING_PRICES', payload: JSON.stringify(payload), actorId: (session.user as any).id } })
  } catch {}
  try {
    const c = await cookies()
    if (hints.length) c.set('admin_clamp_hint', `Цены скорректированы: ${hints.join('; ')}`, { path: '/', maxAge: 10 })
    if (clampFields.size) c.set('admin_clamp_fields', Array.from(clampFields).join(','), { path: '/', maxAge: 10 })
  } catch {}
  revalidatePath('/admin/subscriptions')
}

// Установка номера WhatsApp для офлайн-запросов (виден на странице админских подписок)
export async function setWhatsAppPhone(formData: FormData) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) throw new Error('forbidden')

  const raw = String(formData.get('phone') || '').trim()
  // normalize to +digits only
  const normalized = raw.replace(/[^+0-9]/g, '') || '+79889543377'
  try { await prisma.auditLog.create({ data: { action: 'BILLING_WHATSAPP_PHONE', payload: normalized, actorId: (session.user as any).id } }) } catch {}
  revalidatePath('/admin/subscriptions')
}

// Сохранение лимитов планов (ветки/логопеды/медиа) для всех планов
export async function setPlanLimits(formData: FormData) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) throw new Error('forbidden')

  const plans: Plan[] = ['beta','free','pro','pro_plus','max'] as any
  const payload: any = {}
  const clampNotes: string[] = []
  const clampLimitFields: Set<string> = new Set()
  for (const p of plans) {
    const toInt = (s: string, max: number) => {
      const raw = String(formData.get(s) || '0')
      let n = parseInt(raw.replace(/[^0-9\-]/g, ''), 10)
      if (!isFinite(n) || n < 0) n = 0
      const over = n > max
      if (n > max) n = max
      const fieldName = s
      if (raw.includes('-') && n === 0) { clampNotes.push(`${p}.${s.split('_').pop()} → 0`); clampLimitFields.add(fieldName) }
      if (over) { clampNotes.push(`${p}.${s.split('_').pop()} ограничено ${max}`); clampLimitFields.add(fieldName) }
      return n
    }
    const b = toInt(`${p}_branches`, 1000) // до 1000 филиалов
    const l = toInt(`${p}_logopeds`, 10000) // до 10k логопедов
    const m = toInt(`${p}_mediaMB`, 1_000_000) // до 1 ТБ в MB
    payload[p] = { branches: b, logopeds: l, mediaMB: m }
  }
  try {
    await prisma.auditLog.create({ data: { action: 'BILLING_LIMITS', payload: JSON.stringify(payload), actorId: (session.user as any).id } })
  } catch {}
  try {
    const c = await cookies()
    if (clampNotes.length) c.set('admin_clamp_hint', `Лимиты скорректированы: ${clampNotes.join('; ')}`, { path: '/', maxAge: 10 })
    if (clampLimitFields.size) c.set('admin_clamp_fields', Array.from(clampLimitFields).join(','), { path: '/', maxAge: 10 })
  } catch {}
  revalidatePath('/admin/subscriptions')
}
