import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  const role = (session?.user as any)?.role as string | undefined
  const r = role ?? ''
  if (!session || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(r)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const formData = await req.formData()
  const requestId = String(formData.get('requestId') || '')
  try {
    if (requestId) {
      const pr = await (prisma as any).payoutRequest.findUnique({ where: { id: requestId } })
      if (pr && pr.status === 'PENDING' && (role!=='LOGOPED' || pr.logopedId === userId)) {
        await (prisma as any).payoutRequest.update({ where: { id: pr.id }, data: { status: 'CANCELLED' } })
      }
    } else {
      // отменяем все PENDING для этого логопеда, если id не передали
      await (prisma as any).payoutRequest.updateMany({ where: { logopedId: userId, status: 'PENDING' }, data: { status: 'CANCELLED' } })
    }
  } catch {}
  const proto = req.headers.get('x-forwarded-proto') || 'https'
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'logoped-krd.ru'
  const origin = `${proto}://${host}`
  return NextResponse.redirect(new URL('/logoped/org-finance?cancelled=1', origin), 303)
}
