import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    const actorId = (session.user as any).id as string
    const role = (session.user as any).role as string | undefined
    if (!role || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

    const body = await req.json().catch(() => ({})) as any
    const requestId = String(body.requestId || '')
    const action = String(body.action || '') // 'deny'
    const comment = String(body.comment || '')
    if (!requestId || action !== 'deny') return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 })

    await prisma.auditLog.create({ data: { action: 'PLAN_CHANGE_DENIED', payload: JSON.stringify({ requestId, comment }), actorId } })

    try { revalidatePath('/admin/subscriptions') } catch {}
    try { revalidatePath('/admin/subscriptions/requests') } catch {}

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
