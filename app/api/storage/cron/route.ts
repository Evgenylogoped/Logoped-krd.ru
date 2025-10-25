import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { purgeOldMaterialsForLogoped, purgeOldChatForLogoped } from '@/lib/storage'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const qToken = url.searchParams.get('token') || ''
    const hToken = req.headers.get('x-cron-secret') || ''
    const secret = process.env.CRON_SECRET || ''
    if (secret && !(qToken === secret || hToken === secret)) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }

    const logopeds = await prisma.user.findMany({ where: { role: 'LOGOPED' }, select: { id: true }, take: 10000 })
    let materialsBytes = 0
    let chatBytes = 0
    for (const u of logopeds) {
      try { materialsBytes += await purgeOldMaterialsForLogoped(u.id) } catch {}
      try { chatBytes += await purgeOldChatForLogoped(u.id) } catch {}
    }

    return NextResponse.json({ ok: true, processed: logopeds.length, purged: { materialsBytes, chatBytes, totalBytes: materialsBytes + chatBytes } })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e || 'internal') }, { status: 500 })
  }
}
