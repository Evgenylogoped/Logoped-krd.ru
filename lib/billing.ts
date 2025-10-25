export { getUserPlan } from '@/lib/subscriptions'
export type { Plan } from '@/lib/subscriptions'

// Keep legacy constants for places that still rely on them (map to new Free plan limits)
export const FREE_MAX_BRANCHES = 0
export const FREE_MAX_LOGOPEDS = 1
