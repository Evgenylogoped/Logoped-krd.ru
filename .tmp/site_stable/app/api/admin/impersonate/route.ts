import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions as any)
  const s = session as any
  const role = (s?.user as any)?.role
  if (!s?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId') || ''
  const target = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null
  if (!target) {
    return new NextResponse('Not Found', { status: 404 })
  }
  // Create a NextAuth session row directly (Prisma Adapter compatible)
  const sessionToken = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  await prisma.session.create({ data: { userId: target.id, sessionToken, expires } })

  const res = NextResponse.redirect(new URL('/after-login', req.url))
  // Set both possible cookie names to maximize compatibility in dev/prod
  const isSecure = req.nextUrl.protocol === 'https:'
  res.cookies.set('__Secure-next-auth.session-token', sessionToken, { path: '/', httpOnly: true, sameSite: 'lax', secure: isSecure, expires })
  res.cookies.set('next-auth.session-token', sessionToken, { path: '/', httpOnly: true, sameSite: 'lax', secure: isSecure, expires })
  return res
}
