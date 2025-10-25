import { prisma } from '@/lib/prisma'

export type Plan = 'beta' | 'free' | 'pro' | 'pro_plus' | 'max'

export type PlanLimits = {
  branches: number // max branches
  logopeds: number // max logopeds
  mediaMB: number // total media storage (MB, decimal 1000‑base)
  support: 'email' | 'priority'
  chat: { enabled: boolean; group: boolean }
  stats: { branch: boolean }
}

export type UserLimitsOverride = {
  branches?: number
  logopeds?: number
  mediaMB?: number
}

// Admin-configurable цены для отображения (рубли или любая валюта как строка)
export type PlanPrices = {
  pro: { month: number, year: number, forever?: number | null },
  pro_plus: { month: number, year: number, forever?: number | null },
  max: { month: number, year: number, forever?: number | null },
}

const DEFAULT_PRICES: PlanPrices = {
  pro: { month: 990, year: 9900, forever: null },
  pro_plus: { month: 1490, year: 14900, forever: null },
  max: { month: 2490, year: 24900, forever: null },
}

export async function getPlanPrices(): Promise<PlanPrices> {
  try {
    const last = await prisma.auditLog.findFirst({ where: { action: 'BILLING_PRICES' }, orderBy: { createdAt: 'desc' } })
    if (!last?.payload) return DEFAULT_PRICES
    const parsed = JSON.parse(last.payload)
    return {
      pro: { ...DEFAULT_PRICES.pro, ...(parsed?.pro || {}) },
      pro_plus: { ...DEFAULT_PRICES.pro_plus, ...(parsed?.pro_plus || {}) },
      max: { ...DEFAULT_PRICES.max, ...(parsed?.max || {}) },
    }
  } catch {
    return DEFAULT_PRICES
  }
}

const DEFAULT_LIMITS: Record<Plan, PlanLimits> = {
  // mediaMB set with 1000 MB per 1 GB compared to previous values
  beta:     { branches: 1,  logopeds: 5,  mediaMB: 1000,  support: 'email',    chat: { enabled: true,  group: false }, stats: { branch: false } },
  free:     { branches: 0,  logopeds: 1,  mediaMB: 0,     support: 'email',    chat: { enabled: false, group: false }, stats: { branch: false } },
  pro:      { branches: 1,  logopeds: 5,  mediaMB: 1000,  support: 'email',    chat: { enabled: true,  group: false }, stats: { branch: false } },
  pro_plus: { branches: 4,  logopeds: 20, mediaMB: 5000,  support: 'priority', chat: { enabled: true,  group: true  }, stats: { branch: false } },
  max:      { branches: 10, logopeds: 50, mediaMB: 15000, support: 'priority', chat: { enabled: true,  group: true  }, stats: { branch: true  } },
}

export function normalizePlan(p?: string | null): Plan {
  const v = String(p || '').toLowerCase().replace('+','_plus')
  if (v === 'beta') return 'beta'
  if (v === 'pro') return 'pro'
  if (v === 'pro_plus') return 'pro_plus'
  if (v === 'max') return 'max'
  return 'free'
}

// Returns active plan for the user. If last subscription is BETA and older than 15 days, returns FREE.
export async function getUserPlan(userId: string): Promise<Plan> {
  try {
    const sub = await prisma.subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })
    const plan = normalizePlan(sub?.plan as string | undefined)
    if (plan === 'beta') {
      // Бета только один раз после регистрации и не дольше 15 дней.
      const nonBetaCount = await prisma.subscription.count({ where: { userId, plan: { not: 'beta' } } })
      if (nonBetaCount > 0) return 'free'
      const created = sub?.createdAt ? new Date(sub.createdAt) : null
      if (!created) return 'free'
      const days = Math.floor((Date.now() - created.getTime()) / 86400000)
      return days > 15 ? 'free' : 'beta'
    }
    return plan
  } catch {
    return 'free'
  }
}

export async function getConfigLimits(): Promise<Record<Plan, PlanLimits>> {
  try {
    const last = await prisma.auditLog.findFirst({ where: { action: 'BILLING_LIMITS' }, orderBy: { createdAt: 'desc' } })
    if (!last?.payload) return DEFAULT_LIMITS
    const cfg = JSON.parse(last.payload || '{}') as Partial<Record<Plan, Partial<PlanLimits>>> | undefined
    const merged: Record<Plan, PlanLimits> = { ...DEFAULT_LIMITS }
    ;(['beta','free','pro','pro_plus','max'] as Plan[]).forEach((p) => {
      const patch = cfg?.[p]
      if (patch) {
        merged[p] = {
          branches: typeof patch.branches === 'number' ? patch.branches : DEFAULT_LIMITS[p].branches,
          logopeds: typeof patch.logopeds === 'number' ? patch.logopeds : DEFAULT_LIMITS[p].logopeds,
          mediaMB: typeof patch.mediaMB === 'number' ? patch.mediaMB : DEFAULT_LIMITS[p].mediaMB,
          support: (patch.support === 'email' || patch.support === 'priority') ? patch.support : DEFAULT_LIMITS[p].support,
          chat: {
            enabled: typeof patch.chat?.enabled === 'boolean' ? patch.chat.enabled : DEFAULT_LIMITS[p].chat.enabled,
            group: typeof patch.chat?.group === 'boolean' ? patch.chat.group : DEFAULT_LIMITS[p].chat.group,
          },
          stats: {
            branch: typeof patch.stats?.branch === 'boolean' ? patch.stats.branch : DEFAULT_LIMITS[p].stats.branch,
          },
        }
      }
    })
    return merged
  } catch {
    return DEFAULT_LIMITS
  }
}

export async function getLimits(plan: Plan): Promise<PlanLimits> {
  const all = await getConfigLimits()
  return all[plan]
}

// Возвращает лимиты для пользователя с учётом одобренного оверрайда (только для MAX)
export async function getUserLimits(userId: string, plan: Plan): Promise<PlanLimits> {
  const base = await getLimits(plan)
  if (plan !== 'max') return base
  try {
    const last = await prisma.auditLog.findFirst({ where: { action: 'PLAN_LIMITS_OVERRIDE' }, orderBy: { createdAt: 'desc' } })
    if (!last?.payload) return base
    const p = JSON.parse(last.payload || '{}')
    if (p?.userId !== userId) return base
    const lim: UserLimitsOverride = p?.limits || {}
    return {
      ...base,
      branches: typeof lim.branches === 'number' ? lim.branches : base.branches,
      logopeds: typeof lim.logopeds === 'number' ? lim.logopeds : base.logopeds,
      mediaMB: typeof lim.mediaMB === 'number' ? lim.mediaMB : base.mediaMB,
    }
  } catch {
    return base
  }
}

// Быстрые синхронные хелперы используют значения по умолчанию.
// Для актуальных (отредактированных) лимитов используйте async-функции getLimits()/getConfigLimits().
export function isChatEnabled(plan: Plan): boolean { return DEFAULT_LIMITS[plan].chat.enabled }
export function isGroupChatEnabled(plan: Plan): boolean { return DEFAULT_LIMITS[plan].chat.group }
export function hasPrioritySupport(plan: Plan): boolean { return DEFAULT_LIMITS[plan].support === 'priority' }
export function hasBranchStats(plan: Plan): boolean { return DEFAULT_LIMITS[plan].stats.branch }

export async function getBetaRemainingDays(userId: string): Promise<number> {
  try {
    const sub = await prisma.subscription.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })
    if (!sub || normalizePlan(sub?.plan) !== 'beta') return 0
    const created = sub?.createdAt ? new Date(sub.createdAt) : null
    if (!created) return 0
    const days = Math.floor((Date.now() - created.getTime()) / 86400000)
    const left = 15 - days
    return left > 0 ? left : 0
  } catch {
    return 0
  }
}

// Remaining days in current period. For 'beta' uses 15-day beta logic.
export async function getPlanRemainingDays(userId: string): Promise<number> {
  try {
    const plan = await getUserPlan(userId)
    if (plan === 'beta') return await getBetaRemainingDays(userId)
    const sub = await prisma.subscription.findFirst({
      where: { userId, status: { in: ['active','trialing','past_due'] } },
      orderBy: { updatedAt: 'desc' },
    })
    const end = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null
    if (!end) return 0
    const diff = Math.ceil((end.getTime() - Date.now()) / 86400000)
    return diff > 0 ? diff : 0
  } catch {
    return 0
  }
}
