import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const sess: any = await getServerSession(authOptions as any)
  const role = (sess?.user as any)?.role
  if (!sess?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  const { searchParams } = new URL(req.url)
  const q = String(searchParams.get('q') || '').trim()
  const from = String(searchParams.get('from') || '')
  const to = String(searchParams.get('to') || '')

  const where: any = {}
  if (q) where.action = { contains: q, mode: 'insensitive' }
  if (from) where.createdAt = { ...(where.createdAt||{}), gte: new Date(from) }
  if (to) { const d = new Date(to); d.setHours(23,59,59,999); where.createdAt = { ...(where.createdAt||{}), lte: d } }

  const rows = await (prisma as any).auditLog.findMany({ where, include: { actor: true }, orderBy: { createdAt: 'desc' }, take: 5000 })

  const esc = (v: any) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  const lines = [
    ['createdAt','action','actor','payload'],
    ...rows.map((r:any)=> [
      new Date(r.createdAt).toISOString(),
      r.action,
      r.actor?.name || r.actor?.email || '',
      r.payload || ''
    ])
  ]
  const csv = lines.map(l => l.map(esc).join(',')).join('\n')
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-export-${Date.now()}.csv"`
    }
  })
}
