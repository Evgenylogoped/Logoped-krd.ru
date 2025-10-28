import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const na = 'next-auth' as const
  const mod = await import(na as any).catch(() => null as any)
  const auth = await import('@/lib/auth').catch(() => null as any)
  const getServerSession: any = mod?.getServerSession
  const authOptions = auth?.authOptions
  const session = (typeof getServerSession === 'function' && authOptions) ? await getServerSession(authOptions) : null
  let role = (session?.user as any)?.role as string | undefined
  let adminId = (session?.user as any)?.id as string | undefined
  if (!role || !adminId) {
    try {
      const jwtMod = await import('next-auth/jwt').catch(() => null as any)
      const getToken: any = jwtMod?.getToken
      if (typeof getToken === 'function') {
        const token: any = await getToken({ req, secureCookie: true }).catch(() => null)
        if (token) {
          role = (token.role as string | undefined) || role
          adminId = (token.sub as string | undefined) || (token.userId as string | undefined) || adminId
        }
      }
    } catch {}
  }
  if (!role || !adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

  const rawLessons = await (prisma as any).lesson.findMany({
    where: { logopedId: reqRow.logopedId, payoutStatus: 'NONE', settledAt: { lte: reqRow.createdAt } },
    include: { transactions: { select: { meta: true, kind: true, amount: true, createdAt: true } }, enrolls: { include: { child: true } } },
    select: undefined as any,
    take: 5000,
  })
  const eligible = (rawLessons as any[]).filter(L => !((L.transactions||[]).some((t:any)=> t && (t.meta?.personal === true))))
  // helpers (минимально — считаем долю логопеда и «нал. лог.»)
  const whoPaid = (L: any): 'LEADER'|'THERAPIST'|'UNKNOWN' => {
    const txs = (L.transactions||[]).slice().sort((a:any,b:any)=> new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
    const tx = txs[txs.length-1]
    const mRaw = (tx?.meta?.paymentMethod || tx?.meta?.paymentmethod || '').toString().toLowerCase()
    if (mRaw.includes('cash_therapist') || mRaw.includes('therapist')) return 'THERAPIST'
    if (mRaw.includes('subscription') || mRaw.includes('abon') || mRaw.includes('leader') || mRaw.includes('manager') || mRaw.includes('card') || mRaw.includes('bank') || mRaw.includes('noncash') || mRaw.includes('transfer')) return 'LEADER'
    const hasRevenue = (txs||[]).some((t:any)=> t?.kind==='REVENUE')
    const hasCashHeld = (txs||[]).some((t:any)=> t?.kind==='CASH_HELD')
    if (hasRevenue) return 'LEADER'
    if (hasCashHeld) return 'THERAPIST'
    return 'UNKNOWN'
  }
  const fullPrice = (L: any): number => {
    const txs = (L.transactions||[]).slice().sort((a:any,b:any)=> new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime())
    const anyNominal = (txs||[]).map((t:any)=> Number(t?.meta?.nominalPrice || 0)).find((v:number)=> v>0)
    if (anyNominal && anyNominal > 0) return Math.round(anyNominal)
    const revenueTx = (txs||[]).find((t:any)=> t?.kind==='REVENUE' && Number(t?.amount||0) > 0)
    if (revenueTx) return Math.round(Number(revenueTx.amount||0))
    const sumShares = Number(L.therapistShareAtTime||0) + Number(L.leaderShareAtTime||0)
    if (sumShares > 0) return Math.round(sumShares)
    const rate = Number((L.enrolls||[])[0]?.child?.rateLesson || 0)
    return Math.max(0, Math.round(rate))
  }
  const therapistShare = (L:any): number => {
    const snap = Number(L.therapistShareAtTime || 0)
    if (snap > 0) return Math.round(snap)
    const rev = Number(L.revenueAtTime || 0)
    const pct = Number(L.commissionPercentAtTime || 0) || 50
    if (rev>0 && pct>0) return Math.round(rev*pct/100)
    return Math.round(fullPrice(L) * pct / 100)
  }
  const pendingBalance = eligible.reduce((s:number,L:any)=> s + therapistShare(L), 0)
  let paidToTherapist = 0
  for (const L of eligible) { if (whoPaid(L)==='THERAPIST') paidToTherapist += fullPrice(L) }
  // Signed delta for the window [last confirmation; request.createdAt]
  const finalAmount = Math.round(pendingBalance - paidToTherapist)

  await (prisma as any).$transaction([
    ...((eligible as any[]).map((l: any) => (prisma as any).payoutLessonLink.create({ data: { payoutId, lessonId: l.id } }))),
    (prisma as any).lesson.updateMany({ where: { id: { in: (eligible as any[]).map((l: any) => l.id) } }, data: { payoutStatus: 'PAID' } }),
    (prisma as any).transaction.create({ data: { userId: reqRow.logopedId, kind: 'PAYOUT', amount: finalAmount, meta: { source: 'payout', payoutId, windowTo: reqRow.createdAt, rule: 'share_minus_cashTher' } } }),
    (prisma as any).payoutRequest.update({ where: { id: payoutId }, data: { status: 'PAID', confirmedAt: new Date(), confirmedById: adminId } })
  ])

  // Build absolute URL based on original forwarded origin to avoid "localhost" redirects behind proxy
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'logoped-krd.ru'
  const origin = `${proto}://${host}`
  return NextResponse.redirect(new URL('/admin/finance/payouts', origin), 303)
}
