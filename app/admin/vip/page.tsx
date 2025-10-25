import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import VipBadge from '@/components/VipBadge'
import { setVip, setVipPlus, clearVip } from '@/app/(dash)/admin/users/actions'

export default async function AdminVipPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>

  const sp = (searchParams ? await searchParams : {}) as Record<string, string>
  const q = (sp.q || '').trim()
  const onlyActive = sp.onlyActive === '1'

  const where: any = { role: 'LOGOPED' }
  if (q) where.OR = [{ email: { contains: q } }, { name: { contains: q } }]
  if (onlyActive) where.OR = [{ featured: true }, { featuredSuper: true }]

  const users = await prisma.user.findMany({ where, orderBy: [{ featuredSuper: 'desc' as any }, { featured: 'desc' as any }, { createdAt: 'desc' }], take: 200 })

  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Админ · VIP</h1>
      <form method="get" className="flex items-end gap-3">
        <label className="grid gap-1">
          <span className="text-sm">Поиск</span>
          <input name="q" className="input" defaultValue={q} placeholder="email или имя" />
        </label>
        <label className="inline-flex items-center gap-2 mt-6">
          <input type="checkbox" name="onlyActive" value="1" defaultChecked={onlyActive} />
          <span className="text-sm">Только с меткой</span>
        </label>
        <button className="btn">Фильтровать</button>
      </form>

      <div className="space-y-2">
        {users.length === 0 && <div className="text-sm text-muted">Нет логопедов по заданным условиям</div>}
        {users.map(u => (
          <div key={u.id} className="flex items-center justify-between gap-3 rounded border p-3" style={{ background: 'var(--card-bg)' }}>
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2 flex-wrap">
                {u.name || u.email}
                {((u as any).featuredSuper || (u as any).featured) && (
                  <VipBadge level={(u as any).featuredSuper ? 'VIP+' : 'VIP'} />
                )}
                <span className="text-muted">· {u.email}</span>
              </div>
              <div className="text-xs text-muted">Роль: {u.role}</div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <form action={setVip}>
                <input type="hidden" name="id" value={u.id} />
                <button className="btn-secondary btn-sm" type="submit">VIP</button>
              </form>
              <form action={setVipPlus}>
                <input type="hidden" name="id" value={u.id} />
                <button className="btn-secondary btn-sm" type="submit">VIP+</button>
              </form>
              {((u as any).featured || (u as any).featuredSuper) && (
                <form action={clearVip}>
                  <input type="hidden" name="id" value={u.id} />
                  <button className="btn-outline btn-sm" type="submit">Снять VIP</button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
