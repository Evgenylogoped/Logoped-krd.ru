import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role)) {
    return new NextResponse('Forbidden', { status: 403 })
  }
  const logopedId = (session!.user as any).id as string
  const rows = await (prisma as any).child.findMany({
    where: { logopedId, isArchived: false },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    include: { parent: { include: { user: true } } },
  })
  const header = ['child_last_name','child_first_name','parent_full_name','parent_email','parent_phone']
  const lines = [header.join(',')]
  for (const r of rows as any[]) {
    const parentName = r.parent?.fullName || r.parent?.user?.name || ''
    const parentEmail = r.parent?.user?.email || ''
    const parentPhone = r.parent?.phone || ''
    const cols = [r.lastName||'', r.firstName||'', parentName, parentEmail, parentPhone]
    const safe = cols.map(v => String(v).replaceAll('"','""'))
    lines.push(safe.map(s => `"${s}` + `"`).join(','))
  }
  const csv = lines.join('\n')
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="clients.csv"',
    },
  })
}
