import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encode } from 'next-auth/jwt'

export async function POST(req: Request) {
  try {
    if (process.env.ENABLE_TEST_LOGIN !== '1') {
      return NextResponse.json({ ok: false, error: 'disabled' }, { status: 403 })
    }
    const body = (await req.json().catch(() => ({}))) as any
    const email = String(body.email || '').toLowerCase().trim()
    if (!email) return NextResponse.json({ ok: false, error: 'email required' }, { status: 400 })

    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return NextResponse.json({ ok: false, error: 'user not found' }, { status: 404 })

    const secret = process.env.NEXTAUTH_SECRET || 'test-secret'
    const token = await encode({
      token: { id: (user as any).id, email: user.email, name: user.name, role: (user as any).role },
      secret,
    })

    const res = NextResponse.json({ ok: true })
    const base = process.env.NEXTAUTH_URL || ''
    let hostname: string | undefined
    try { const u = new URL(base); hostname = u.hostname } catch {}
    const cookieName = '__Secure-next-auth.session-token'
    res.cookies.set(cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
      ...(hostname ? { domain: hostname } : {}),
    })
    return res
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
