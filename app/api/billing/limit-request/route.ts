import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    const userId = (session.user as any).id as string
    const userEmail = (session.user as any).email as string | undefined
    const userName = (session.user as any).name as string | undefined
    const body = await req.json().catch(() => ({})) as any
    const branches = Number(body.branches || 0)
    const logopeds = Number(body.logopeds || 0)
    const mediaMB = Number(body.mediaMB || 0)

    // Отменяем предыдущие запросы на лимиты
    const prev = await prisma.auditLog.findMany({ where: { action: 'LIMIT_INCREASE_REQUEST' }, orderBy: { createdAt: 'desc' }, take: 100 })
    for (const r of prev) {
      try {
        const p = JSON.parse((r as any).payload || '{}')
        if (p?.userId === userId) {
          await prisma.auditLog.create({ data: { action: 'LIMIT_INCREASE_CANCELED', payload: JSON.stringify({ requestId: r.id, by: 'new_request' }), actorId: userId } })
        }
      } catch {}
    }

    const meta = { userId, userEmail, userName, wanted: { branches, logopeds, mediaMB } }
    const created = await prisma.auditLog.create({ data: { action: 'LIMIT_INCREASE_REQUEST', payload: JSON.stringify(meta), actorId: userId } })

    try { revalidatePath('/admin/subscriptions') } catch {}
    try { revalidatePath('/admin/subscriptions/requests') } catch {}
    try { revalidatePath('/admin/subscriptions/limit-requests') } catch {}
    try { revalidatePath('/settings/billing') } catch {}

    return NextResponse.json({ ok: true, id: created.id })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    const userId = (session.user as any).id as string

    const logs = await prisma.auditLog.findMany({ where: { action: { in: ['LIMIT_INCREASE_REQUEST', 'LIMIT_INCREASE_CANCELED', 'LIMIT_INCREASE_DENIED', 'PLAN_LIMITS_OVERRIDE'] } }, orderBy: { createdAt: 'desc' }, take: 200 })
    const canceled = new Set<string>()
    const denied = new Set<string>()
    const approved = new Set<string>()
    for (const r of logs) {
      try {
        const p = JSON.parse((r as any).payload || '{}')
        if (r.action === 'LIMIT_INCREASE_CANCELED' && p?.requestId) canceled.add(String(p.requestId))
        if (r.action === 'LIMIT_INCREASE_DENIED' && p?.requestId) denied.add(String(p.requestId))
        if (r.action === 'PLAN_LIMITS_OVERRIDE' && p?.requestId) approved.add(String(p.requestId))
      } catch {}
    }
    const lastReq = logs.find(r => {
      if (r.action !== 'LIMIT_INCREASE_REQUEST') return false
      try { const p = JSON.parse((r as any).payload || '{}'); return p?.userId === userId } catch { return false }
    })
    if (!lastReq) return NextResponse.json({ ok: true, request: null })
    const payload = (() => { try { return JSON.parse((lastReq as any).payload || '{}') } catch { return {} } })()
    const status = canceled.has(lastReq.id) ? 'canceled' : denied.has(lastReq.id) ? 'denied' : approved.has(lastReq.id) ? 'approved' : 'pending'
    return NextResponse.json({ ok: true, request: { id: lastReq.id, payload, createdAt: lastReq.createdAt, status } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
