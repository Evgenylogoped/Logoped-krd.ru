import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0,0,0,0)
  return x
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return new NextResponse('Unauthorized', { status: 401 })
  const userId = (session.user as any).id as string
  const url = new URL(req.url)
  const scope = (url.searchParams.get('scope') || 'company').toLowerCase() // company | branch | global
  const daysStr = url.searchParams.get('days') || '30'
  const dist = (url.searchParams.get('dist') || '').toLowerCase() // 'branches' | 'companies' | ''
  const companyIdFilter = url.searchParams.get('companyId') || null
  const days = [7,30,90].includes(Number(daysStr)) ? Number(daysStr) : 30

  // load user + org
  const me = await prisma.user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } })
  if (!me) return new NextResponse('User not found', { status: 404 })
  const companyId = me.branch?.companyId || null
  const branchId = me.branchId || null
  const isOwner = Boolean(companyId && me.branch?.company?.ownerId === me.id)
  const isBranchManager = Boolean(branchId && me.branch?.managerId === me.id)
  const isAccountant = ['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes((session.user as any).role)

  const since = new Date(Date.now() - days*24*60*60*1000)

  let whereLessons: any = { startsAt: { gte: since } }
  if (scope === 'global') {
    if (!isAccountant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (companyIdFilter) {
      whereLessons = { ...whereLessons, group: { branch: { companyId: companyIdFilter } } }
    }
  } else if (scope === 'company') {
    if (isOwner && companyId) {
      whereLessons = { ...whereLessons, group: { branch: { companyId } } }
    } else if (isAccountant && companyIdFilter) {
      whereLessons = { ...whereLessons, group: { branch: { companyId: companyIdFilter } } }
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    if (!branchId || !(isBranchManager || isOwner)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    whereLessons = { ...whereLessons, group: { branchId } }
  }

  // fetch lessons in window
  const lessons = await prisma.lesson.findMany({ where: whereLessons, select: { startsAt: true } })

  // aggregate per day
  const buckets: Record<string, number> = {}
  for (let i=0;i<days;i++) {
    const d = startOfDay(new Date(Date.now() - (days-1-i)*24*60*60*1000))
    buckets[d.toISOString()] = 0
  }
  for (const l of lessons) {
    const d = startOfDay(new Date(l.startsAt))
    const key = d.toISOString()
    if (key in buckets) buckets[key] += 1
  }

  // summary numbers (current snapshot)
  let totals: any = {}
  if (scope === 'global') {
    if (!isAccountant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (companyIdFilter) {
      totals = {
        logopeds: await prisma.user.count({ where: { role: 'LOGOPED', branch: { companyId: companyIdFilter } } }),
        groups: await prisma.group.count({ where: { branch: { companyId: companyIdFilter } } }),
      }
    } else {
      totals = {
        logopeds: await prisma.user.count({ where: { role: 'LOGOPED' } }),
        groups: await prisma.group.count(),
      }
    }
  } else if (scope === 'company') {
    if (isOwner && companyId) {
      totals = {
        logopeds: await prisma.user.count({ where: { role: 'LOGOPED', branch: { companyId: companyId! } } }),
        groups: await prisma.group.count({ where: { branch: { companyId: companyId! } } }),
      }
    } else if (isAccountant && companyIdFilter) {
      totals = {
        logopeds: await prisma.user.count({ where: { role: 'LOGOPED', branch: { companyId: companyIdFilter } } }),
        groups: await prisma.group.count({ where: { branch: { companyId: companyIdFilter } } }),
      }
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else {
    totals = {
      logopeds: await prisma.user.count({ where: { role: 'LOGOPED', branchId: branchId! } }),
      groups: await prisma.group.count({ where: { branchId: branchId! } }),
    }
  }

  // optional distributions
  if (dist === 'branches' && scope === 'company') {
    let targetCompanyId: string | null = null
    if (isOwner && companyId) targetCompanyId = companyId
    else if (isAccountant && companyIdFilter) targetCompanyId = companyIdFilter
    else return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const branches = await prisma.branch.findMany({ where: { companyId: targetCompanyId }, select: { id: true, name: true } })
    const branchIds = branches.map(b => b.id)
    // count lessons per branch in period
    const byBranch: Record<string, number> = {}
    for (const b of branches) byBranch[b.id] = 0
    const lessonsByBranch = await prisma.lesson.findMany({
      where: { startsAt: { gte: since }, group: { branchId: { in: branchIds } } },
      select: { group: { select: { branchId: true } } }
    })
    for (const l of lessonsByBranch) {
      const bid = (l as any).group.branchId as string
      if (byBranch[bid] !== undefined) byBranch[bid] += 1
    }
    const distribution = branches.map(b => ({ id: b.id, name: b.name, lessons: byBranch[b.id] || 0 }))
    return NextResponse.json({ scope, days, since: since.toISOString(), distribution, totals })
  }

  if (dist === 'companies' && scope === 'global') {
    if (!isAccountant) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    // aggregate per company for period
    const companies = await prisma.company.findMany({ select: { id: true, name: true } })
    const companyIds = companies.map(c => c.id)
    const byCompany: Record<string, number> = {}
    for (const c of companies) byCompany[c.id] = 0
    const lessonsByCompany = await prisma.lesson.findMany({
      where: { startsAt: { gte: since }, group: { branch: { companyId: { in: companyIds } } } },
      select: { group: { select: { branch: { select: { companyId: true } } } } }
    })
    for (const l of lessonsByCompany) {
      const cid = ((l as any).group.branch as any).companyId as string
      if (byCompany[cid] !== undefined) byCompany[cid] += 1
    }
    const distribution = companies.map(c => ({ id: c.id, name: c.name, lessons: byCompany[c.id] || 0 }))
    return NextResponse.json({ scope, days, since: since.toISOString(), distribution, totals })
  }

  return NextResponse.json({ scope, days, since: since.toISOString(), buckets, totals })
}
