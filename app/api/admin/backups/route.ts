import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const pexec = promisify(exec)

export async function POST() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role as string | undefined
  if (!session || role !== 'SUPER_ADMIN') {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  }
  try {
    // В контейнере смонтирован исполняемый скрипт резервного копирования
    const { stdout, stderr } = await pexec('/usr/local/bin/backup_logoped_etalon.sh')
    return NextResponse.json({ ok: true, stdout, stderr: stderr || undefined })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
