import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const id = String(form.get('id') || '')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    await (prisma as any).transaction.update({ where: { id }, data: { archivedAt: new Date() } })
    const url = new URL(req.url)
    url.pathname = '/admin/finance/payouts'
    return NextResponse.redirect(url.toString(), { status: 302 })
  } catch (e:any) {
    return NextResponse.json({ error: 'internal_error', details: e?.message || String(e) }, { status: 500 })
  }
}
