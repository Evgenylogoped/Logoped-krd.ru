import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { encode } from 'next-auth/jwt'

export async function POST(req: Request) {
  try {
    // Разрешаем только если явно включено флагом окружения
    if (process.env.ENABLE_TEST_LOGIN !== '1') {
      return NextResponse.json({ ok: false, error: 'disabled' }, { status: 403 })
    }
    const body = await req.json().catch(() => ({})) as any
    const email = String(body.email || '').toLowerCase().trim()
    if (!email) return NextResponse.json({ ok: false, error: 'email required' }, { status: 400 })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return NextResponse.json({ ok: false, error: 'user not found' }, { status: 404 })

    const secret = process.env.NEXTAUTH_SECRET || 'test-secret'
    const token = await encode({
      token: { id: user.id, email: user.email, name: user.name, role: (user as any).role },
      secret,
    })

    const res = NextResponse.json({ ok: true })
    // В проде под HTTPS next-auth использует __Secure-next-auth.session-token
    res.cookies.set('__Secure-next-auth.session-token', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
      domain: 'logoped-krd.ru',
    })
    return res
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    if (process.env.ENABLE_TEST_LOGIN !== '1') {
      return NextResponse.json({ ok: false, error: 'disabled' }, { status: 403 })
    }
    const url = new URL(req.url)
    const email = String(url.searchParams.get('email') || '').toLowerCase().trim()
    if (!email) return NextResponse.json({ ok: false, error: 'email required' }, { status: 400 })
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return NextResponse.json({ ok: false, error: 'user not found' }, { status: 404 })

    const secret = process.env.NEXTAUTH_SECRET || 'test-secret'
    const token = await encode({
      token: { id: user.id, email: user.email, name: user.name, role: (user as any).role },
      secret,
    })

    // Явный абсолютный редирект на публичный хост, чтобы исключить localhost
    const res = NextResponse.redirect('https://logoped-krd.ru/')
    res.cookies.set('__Secure-next-auth.session-token', token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: true,
      domain: 'logoped-krd.ru',
    })
    return res
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 })
  }
}
