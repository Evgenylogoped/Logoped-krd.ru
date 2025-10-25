import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role as string | undefined
  const adminId = (session?.user as any)?.id as string | undefined
  if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const r = role ?? ''
  let allowed = ['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(r)
  if (!allowed && role === 'LOGOPED') {
    try {
      const meGuard = await (prisma as any).user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
      const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: adminId }, select: { id: true } })
      const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: adminId }, select: { id: true } })
      const isOwnerGuard = Boolean(meGuard?.branch?.company?.ownerId === adminId) || Boolean(ownedCompany)
      const isBranchManagerGuard = Boolean(meGuard?.branch?.managerId === adminId) || Boolean(managesAny)
      allowed = isOwnerGuard || isBranchManagerGuard
    } catch {}
  }
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await req.formData()
  const payoutId = String(formData.get('payoutId') || '')
  const amountStr = String(formData.get('amount') || '')
  const customAmount = amountStr ? Number(amountStr) : undefined

  const reqRow = await (prisma as any).payoutRequest.findUnique({ where: { id: payoutId } })
  if (!reqRow) return NextResponse.json({ error: 'Payout request not found' }, { status: 404 })
  if (reqRow.status !== 'PENDING') {
    return NextResponse.json({ error: 'Request is not pending' }, { status: 409 })
  }

  // Safeguard: if after request.createdAt there are new eligible lessons, block confirmation (request became stale)
  try {
    const probe = await (prisma as any).lesson.findMany({
      where: {
        logopedId: reqRow.logopedId,
        payoutStatus: 'NONE',
        settledAt: { not: null, gt: reqRow.createdAt, lt: new Date() },
      },
      include: { transactions: { select: { meta: true } } },
      take: 3,
    })
    const hasNewEligible = (probe as any[]).some(L => (L.transactions||[]).some((t:any)=> t && (t.meta?.personal !== true)))
    if (hasNewEligible) {
      return NextResponse.json({ error: 'Request is stale: new eligible lessons appeared after the request. Ask logoped to resubmit.' }, { status: 409 })
    }
  } catch {}

  const lessons = await (prisma as any).lesson.findMany({
    where: { logopedId: reqRow.logopedId, payoutStatus: 'NONE', settledAt: { lte: reqRow.createdAt } },
    select: { id: true },
  })
  const finalAmount = customAmount != null ? customAmount : Number(reqRow.finalAmount || 0)

  await (prisma as any).$transaction([
    ...(lessons.map((l: any) => (prisma as any).payoutLessonLink.create({ data: { payoutId, lessonId: l.id } }))),
    (prisma as any).lesson.updateMany({ where: { id: { in: lessons.map((l: any) => l.id) } }, data: { payoutStatus: 'PAID' } }),
    (prisma as any).transaction.create({ data: { userId: reqRow.logopedId, kind: 'PAYOUT', amount: finalAmount, meta: { source: 'payout', payoutId } } }),
    (prisma as any).payoutRequest.update({ where: { id: payoutId }, data: { status: 'PAID', confirmedAt: new Date(), confirmedById: adminId } })
  ])

  return NextResponse.redirect(new URL('/admin/finance/payouts', req.url), 303)
}
