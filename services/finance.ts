import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

// Default commission percent if no historical rate is set
const DEFAULT_COMMISSION_PERCENT = 50

export async function getCurrentCommissionPercent(userId: string): Promise<number> {
  const now = new Date()
  const rate = await prisma.commissionRate.findFirst({
    where: { userId, OR: [{ validTo: null }, { validTo: { gte: now } }], validFrom: { lte: now } },
    orderBy: { validFrom: 'desc' },
  })
  if (rate?.percent && rate.percent > 0 && rate.percent <= 100) return rate.percent
  return DEFAULT_COMMISSION_PERCENT
}

export async function getTherapistSummary(userId: string) {
  // Aggregate therapist balance and cash held based on transactions
  const [balanceAgg, cashAgg, payoutAgg] = await Promise.all([
    prisma.transaction.aggregate({ where: { userId, kind: 'THERAPIST_BALANCE' }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId, kind: 'CASH_HELD' }, _sum: { amount: true } }),
    prisma.transaction.aggregate({ where: { userId, kind: 'PAYOUT' }, _sum: { amount: true } }),
  ])
  const balance = Number(balanceAgg._sum?.amount ?? 0)
  const cashHeld = Number(cashAgg._sum?.amount ?? 0)
  const payouts = Number(payoutAgg._sum?.amount ?? 0)
  // Нетто-взаиморасчет: что начислено логопеду минус долг логопеда минус уже выплачено
  return { balance, cashHeld, payouts, final: balance - cashHeld - payouts }
}

export type PaymentMethod = 'AUTO' | 'CASH_THERAPIST' | 'CASH_LEADER' | 'CASHLESS_LEADER'

export async function applyLessonSettlement(lessonId: string, paymentMethod?: PaymentMethod): Promise<void> {
  // Fetch lesson with logoped and group->branch->company
  let lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { logoped: { include: { branch: { include: { company: true } } } }, group: { include: { branch: { include: { company: true } } } } } })
  if (!lesson) return
  const logopedId = lesson.logopedId
  if (!logopedId) return
  // Prefer branch from the lesson's group when available, otherwise fallback to logoped's branch
  let branchId = (lesson as { group?: { branchId?: string | null } | null })?.group?.branchId || (lesson.logoped as { branchId?: string | null } | null)?.branchId || undefined
  let companyId = (lesson as { group?: { branch?: { companyId?: string | null } | null } | null })?.group?.branch?.companyId || (lesson.logoped as { branch?: { companyId?: string | null } | null } | null)?.branch?.companyId || undefined

  // Ensure lesson is bound to a group of the logoped's branch to keep org linkage consistent
  if (!lesson.groupId && (lesson.logoped as { branchId?: string | null } | null)?.branchId) {
    const lgBranchId = (lesson.logoped as { branchId?: string | null } | null)?.branchId as string
    const defaultGroup = await prisma.group.findFirst({ where: { branchId: lgBranchId } })
      || await prisma.group.create({ data: { name: 'General', branchId: lgBranchId } })
    await prisma.lesson.update({ where: { id: lessonId }, data: { groupId: defaultGroup.id } })
    // refetch minimal to get branch/company via group
    lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, include: { logoped: { include: { branch: { include: { company: true } } } }, group: { include: { branch: { include: { company: true } } } } } })
    branchId = (lesson as { group?: { branchId?: string | null } | null })?.group?.branchId || branchId
    companyId = (lesson as { group?: { branch?: { companyId?: string | null } | null } | null })?.group?.branch?.companyId || companyId
  }

  // Detect leader/solo: leader => owner of any company or manager of any branch. solo => no branch
  const ownedCompany = await prisma.company.findFirst({ where: { ownerId: logopedId }, select: { id: true } })
  const managesAny = await prisma.branch.findFirst({ where: { managerId: logopedId }, select: { id: true } })
  const isLeader = Boolean(ownedCompany) || Boolean(managesAny)
  const isSolo = !((lesson?.logoped as { branchId?: string | null } | null)?.branchId)
  const isPersonal = isLeader || isSolo

  // If personal — do not attribute to branch/company in any transactions
  if (isPersonal) {
    branchId = undefined
    companyId = undefined
  }

  // Idempotency: try to set snapshots only if not yet settled
  const percent = await getCurrentCommissionPercent(logopedId)
  // Try to derive child-specific price via Enrollment -> Child.rateLesson
  let nominalPrice = 0
  const enroll = await prisma.enrollment.findFirst({
    where: { lessonId, status: 'ENROLLED' },
    include: { child: true },
  })
  if (enroll?.child?.rateLesson != null) {
    nominalPrice = Number(enroll.child.rateLesson ?? 0)
  } else {
    const price = (lesson?.logoped as { lessonPrice?: number | Prisma.Decimal | null } | null)?.lessonPrice ?? 0
    nominalPrice = Number(price || 0)
  }
  // Determine method: default AUTO
  const method: PaymentMethod = paymentMethod || 'AUTO'

  // AUTO: use active pass if available
  const now = new Date()
  let revenue = 0
  let therapistShare = 0
  let leaderShare = 0

  if (method === 'AUTO') {
    const activePass = await prisma.pass.findFirst({
      where: {
        childId: enroll?.child?.id || undefined,
        status: 'ACTIVE',
        remainingLessons: { gt: 0 },
        AND: [
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
          // если нужен таргетинг на конкретного логопеда
          { OR: [{ logopedId: null }, { logopedId }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
    })
    if (activePass) {
      // idempotent usage: unique(lessonId)
      const existedUsage = await prisma.passUsage.findUnique({ where: { lessonId: lessonId } })
      if (!existedUsage) {
        const pricePerLesson = Number(activePass.totalPrice ?? 0) / Math.max(1, Number(activePass.totalLessons ?? 0))
        revenue = Math.max(0, pricePerLesson)
        therapistShare = Math.round(revenue * percent / 100)
        leaderShare = Math.max(0, revenue - therapistShare)

        const willRemain = Math.max(0, Number(activePass.remainingLessons ?? 0) - 1)
        await prisma.$transaction([
          prisma.lesson.updateMany({
            where: { id: lessonId, settledAt: null },
            data: {
              commissionPercentAtTime: percent,
              revenueAtTime: revenue,
              therapistShareAtTime: therapistShare,
              leaderShareAtTime: leaderShare,
              settledAt: new Date(),
            }
          }),
          prisma.passUsage.create({ data: { passId: activePass.id, lessonId } }),
          prisma.pass.update({
            where: { id: activePass.id },
            data: {
              remainingLessons: { decrement: 1 },
              ...(willRemain === 0 ? { status: 'CANCELLED' } : {}),
            }
          }),
          prisma.transaction.create({
            data: {
              userId: logopedId,
              lessonId,
              kind: 'THERAPIST_BALANCE',
              amount: therapistShare,
              branchId: branchId || null,
              companyId: companyId || null,
              meta: { source: 'settlement', percent, paymentMethod: 'SUBSCRIPTION', personal: isPersonal },
            }
          }),
          // Запишем выручку филиала для дашборда
          prisma.transaction.create({
            data: {
              userId: logopedId,
              lessonId,
              kind: 'REVENUE',
              amount: revenue,
              branchId: branchId || null,
              companyId: companyId || null,
              meta: { source: 'settlement', paymentMethod: 'SUBSCRIPTION', personal: isPersonal },
            }
          })
        ])
        return
      } else {
        // already used pass for this lesson; ensure lesson marked settled
        await prisma.lesson.updateMany({
          where: { id: lessonId, settledAt: null },
          data: { settledAt: new Date() }
        })
        return
      }
    }
    // if no pass, fallthrough to method selection by nominal price
  }

  // Non-pass methods: compute shares from nominalPrice
  if (method === 'CASH_THERAPIST') {
    revenue = 0 // по правилам, выручка руководителя 0
    therapistShare = 0
    leaderShare = Math.round(Math.max(0, nominalPrice - Math.round(nominalPrice * percent / 100)))
    const res = await prisma.lesson.updateMany({
      where: { id: lessonId, settledAt: null },
      data: {
        commissionPercentAtTime: percent,
        revenueAtTime: revenue,
        therapistShareAtTime: therapistShare,
        leaderShareAtTime: leaderShare,
        settledAt: new Date(),
      }
    })
    if (!res || res.count === 0) return
    await prisma.transaction.create({
      data: {
        userId: logopedId,
        lessonId,
        kind: 'CASH_HELD',
        amount: leaderShare,
        branchId: branchId || null,
        companyId: companyId || null,
        meta: { source: 'settlement', percent, paymentMethod: 'CASH_THERAPIST', nominalPrice, personal: isPersonal },
      }
    })
    return
  }

  // CASH_LEADER or CASHLESS_LEADER: full nominal price to revenue
  revenue = Math.max(0, nominalPrice)
  therapistShare = Math.round(revenue * percent / 100)
  leaderShare = Math.max(0, revenue - therapistShare)

  const res = await prisma.lesson.updateMany({
    where: { id: lessonId, settledAt: null },
    data: {
      commissionPercentAtTime: percent,
      revenueAtTime: revenue,
      therapistShareAtTime: therapistShare,
      leaderShareAtTime: leaderShare,
      settledAt: new Date(),
    }
  })
  if (!res || res.count === 0) return
  await prisma.transaction.create({
    data: {
      userId: logopedId,
      lessonId,
      kind: 'THERAPIST_BALANCE',
      amount: therapistShare,
      branchId: branchId || null,
      companyId: companyId || null,
      meta: { source: 'settlement', percent, paymentMethod: method, personal: isPersonal },
    }
  })
  // Запишем выручку филиала для дашборда
  await prisma.transaction.create({
    data: {
      userId: logopedId,
      lessonId,
      kind: 'REVENUE',
      amount: revenue,
      branchId: branchId || null,
      companyId: companyId || null,
      meta: { source: 'settlement', paymentMethod: method, personal: isPersonal },
    }
  })
}
