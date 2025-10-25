import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const { email } = await req.json().catch(()=>({})) as any
    const e = String(email || '').toLowerCase().trim()
    if (!e) return NextResponse.json({ ok: false, error: 'email_required' }, { status: 400 })
    const user = await prisma.user.findUnique({ where: { email: e }, select: { id: true, role: true, emailVerifiedAt: true } })
    if (!user) return NextResponse.json({ ok: true, reason: 'no_user' })
    if (user.role === 'PARENT') {
      const p = await prisma.parent.findUnique({ where: { userId: user.id }, select: { isArchived: true } })
      if (p && p.isArchived === false) return NextResponse.json({ ok: true, reason: 'ok' })
    }
    if (!user.emailVerifiedAt) return NextResponse.json({ ok: true, reason: 'unverified' })
    return NextResponse.json({ ok: true, reason: 'unknown' })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
