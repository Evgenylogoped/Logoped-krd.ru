import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function AdminAuditPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>

  const sp = (searchParams ? await searchParams : {}) as Record<string, string>
  const q = String(sp?.q || '').trim()
  const from = String(sp?.from || '')
  const to = String(sp?.to || '')
  const page = Math.max(1, Number(sp?.page || '1'))
  const take = 50
  const skip = (page - 1) * take

  const where: any = {}
  if (q) where.action = { contains: q, mode: 'insensitive' }
  if (from) where.createdAt = { ...(where.createdAt||{}), gte: new Date(from) }
  if (to) { const d = new Date(to); d.setHours(23,59,59,999); where.createdAt = { ...(where.createdAt||{}), lte: d } }

  const [total, rows] = await Promise.all([
    (prisma as any).auditLog.count({ where }),
    (prisma as any).auditLog.findMany({ where, include: { actor: true }, orderBy: { createdAt: 'desc' }, skip, take })
  ])
  const pages = Math.max(1, Math.ceil(total / take))

  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Админ · Аудит</h1>
      <form method="get" className="grid gap-3 md:grid-cols-4 items-end">
        <label className="grid gap-1">
          <span className="text-sm">Действие (поиск)</span>
          <input name="q" className="input" defaultValue={q} placeholder="например, user.delete" />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">От</span>
          <input type="date" name="from" className="input" defaultValue={from} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">До</span>
          <input type="date" name="to" className="input" defaultValue={to} />
        </label>
        <div><button className="btn">Найти</button></div>
      </form>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted">Найдено: {total}</div>
        <a
          className="btn btn-secondary btn-sm"
          href={`/admin/audit/export?q=${encodeURIComponent(q)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
        >Экспорт CSV</a>
      </div>

      <div className="overflow-auto">
        <table className="table w-full text-sm">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Действие</th>
              <th>Инициатор</th>
              <th>Данные</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r:any)=> (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString('ru-RU')}</td>
                <td><code>{r.action}</code></td>
                <td>{r.actor?.name || r.actor?.email || '—'}</td>
                <td><pre className="max-w-[520px] whitespace-pre-wrap break-all">{r.payload}</pre></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <div>Всего записей: {total}</div>
          <div className="flex gap-2">
            {Array.from({ length: pages }).map((_, i) => {
              const p = i + 1
              const params = new URLSearchParams({ q, from, to, page: String(p) })
              return <a key={p} className={`btn btn-sm ${p===page ? 'btn-secondary' : ''}`} href={`?${params.toString()}`}>{p}</a>
            })}
          </div>
        </div>
      )}
    </div>
  )
}
