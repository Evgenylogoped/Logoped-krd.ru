import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const pexec = promisify(exec)
const LOG = '/tmp/backup_etalon.log'
const LOCK = '/tmp/backup_etalon.lock'

async function ensureSuperAdmin() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role as string | undefined
  if (!session || role !== 'SUPER_ADMIN') return null
  return session
}

export async function GET(request: Request) {
  const session = await ensureSuperAdmin()
  if (!session) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 })

  const url = new URL(request.url)
  if (url.searchParams.get('status')) {
    let running = false
    try { await fs.stat(LOCK); running = true } catch {}
    let tail = ''
    try {
      const { stdout } = await pexec(`bash -lc "[ -f ${LOG} ] && tail -n 100 ${LOG} || true"`)
      tail = stdout
    } catch {}
    return NextResponse.json({ ok: true, running, tail })
  }

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
    // If already running — do not start another one
    const check = await pexec(`bash -lc '[ -f ${LOCK} ] && echo RUNNING || true'`)
    if ((check.stdout || '').includes('RUNNING')) {
      return NextResponse.json({ ok: true, started: false, running: true, note: 'Already running' })
    }
    // Start async in background with lock and logging
    await pexec(`setsid bash -lc '( set -e; date; echo START; touch ${LOCK}; /usr/local/bin/backup_logoped_etalon.sh; RC=$?; echo rc=$RC; rm -f ${LOCK}; echo DONE; date )' >> ${LOG} 2>&1 &`)
    return NextResponse.json({ ok: true, started: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
