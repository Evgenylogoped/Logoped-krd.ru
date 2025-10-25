import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { promises as fs } from 'node:fs'
import path from 'node:path'

export const dynamic = 'force-dynamic'

async function readItems() {
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
  return entries.slice(0, 50)
}

export default async function AdminBackupsPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role as string | undefined
  if (!session || role !== 'SUPER_ADMIN') redirect('/')
  const items = await readItems()
  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Эталонные бэкапы</h1>
      <div className="flex gap-3">
        <form action="/admin/backups" method="get"><button className="btn" type="submit">Обновить список</button></form>
        <form action="/api/admin/backups" method="post"><button className="btn btn-primary" type="submit">Создать эталонный бэкап</button></form>
        <a className="btn" href="/api/admin/backups?status=1" target="_blank">Статус/лог</a>
      </div>
      <div className="overflow-auto">
        <table className="table w-full">
          <thead><tr><th>Имя файла</th><th>Размер</th><th>Время</th><th>Каталог</th></tr></thead>
          <tbody>
            {items.map((it:any, idx:number) => (
              <tr key={idx}>
                <td className="font-mono text-sm break-all">{it.name}</td>
                <td className="text-sm">{(it.size/1024/1024).toFixed(1)} MB</td>
                <td className="text-sm">{new Date(it.mtime).toLocaleString('ru-RU')}</td>
                <td className="text-xs text-muted break-all">{it.dir}</td>
              </tr>
            ))}
            {items.length === 0 && (<tr><td colSpan={4} className="text-sm text-muted">Файлы бэкапов не найдены</td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  )
}
