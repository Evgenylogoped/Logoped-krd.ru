import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

async function loadItems() {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL || ''}/api/admin/backups`, { cache: 'no-store' })
    if (!res.ok) return [] as any[]
    const j = await res.json()
    return Array.isArray(j?.items) ? j.items : []
  } catch {
    return []
  }
}

export default async function AdminBackupsPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role as string | undefined
  if (!session || role !== 'SUPER_ADMIN') redirect('/')
  const items = await loadItems()
  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Эталонные бэкапы</h1>
      <div className="flex gap-3">
        <form action="/admin/backups" method="get"><button className="btn" type="submit">Обновить список</button></form>
        <form action="/api/admin/backups" method="post"><button className="btn btn-primary" type="submit">Создать эталонный бэкап</button></form>
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
