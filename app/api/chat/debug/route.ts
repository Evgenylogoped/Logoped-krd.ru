import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { getToken, decode } from 'next-auth/jwt'
import { authOptions } from '@/lib/auth'

export const runtime = 'nodejs'
export const revalidate = 0
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const session = await getServerSession(authOptions)
    const gssId = session?.user ? (session.user as any).id as string | undefined : undefined
    let fromGetToken: string | null = null
    try {
      const tok = await getToken({ req: req as any, secret: process.env.NEXTAUTH_SECRET })
      if (tok && (tok as any).id) fromGetToken = String((tok as any).id)
    } catch {}

    // manual cookie read (for edge cases)
    let hasSecure = false, hasDev = false, decodedId: string | null = null
    try {
      const cookieHdr = (req.headers.get('cookie') || '')
      hasSecure = /__Secure-next-auth\.session-token=/.test(cookieHdr)
      hasDev = /next-auth\.session-token=/.test(cookieHdr)
      const raw = cookieHdr.split('; ').find(s=> s.startsWith('__Secure-next-auth.session-token='))?.split('=')[1]
        || cookieHdr.split('; ').find(s=> s.startsWith('next-auth.session-token='))?.split('=')[1]
      if (raw) {
        const tok: any = await decode({ token: raw, secret: process.env.NEXTAUTH_SECRET || '' }).catch(()=>null)
        if (tok && tok.id) decodedId = String(tok.id)
      }
    } catch {}

    return NextResponse.json({
      now: Date.now(),
      path: url.pathname,
      cookies: { hasSecure, hasDev },
      session: { id: gssId || null },
      getToken: { id: fromGetToken },
      decode: { id: decodedId },
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return new NextResponse('debug error', { status: 500 })
  }
}
