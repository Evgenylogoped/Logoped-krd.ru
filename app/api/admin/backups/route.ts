import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const pexec = promisify(exec)

async function ensureSuperAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role as string | undefined
  if (!session || role !== 'SUPER_ADMIN') return null
  return session
}

export async function GET() {
  const session = await ensureSuperAdmin()
  if (!session) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  const NAS_BASE = process.env.NAS_BASE || '/mnt/nas_logoped'
  const ETALON_DIR = process.env.ETALON_DIR || path.join(NAS_BASE, 'etalon')
  const candidates = [ETALON_DIR, NAS_BASE]
  const entries: Array<{ name: string; size: number; mtime: number; dir: string }> = []
  for (const dir of candidates) {
    try {
      const list = await fs.readdir(dir)
      for (const name of list) {
        if (!/^db_.*\.sql\.gz$/.test(name) && !/^logoped_backup_.*\.tar\.gz$/.test(name)) continue
        try {
          const st = await fs.stat(path.join(dir, name))
          if (st.isFile()) entries.push({ name, size: st.size, mtime: st.mtimeMs, dir })
        } catch {}
      }
    } catch {}
  }
  entries.sort((a,b) => b.mtime - a.mtime)
  return NextResponse.json({ ok: true, items: entries.slice(0, 50) })
}

export async function POST() {
  const session = await ensureSuperAdmin()
  if (!session) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })
  try {
    const { stdout, stderr } = await pexec('/usr/local/bin/backup_logoped_etalon.sh')
    return NextResponse.json({ ok: true, stdout, stderr: stderr || undefined })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
