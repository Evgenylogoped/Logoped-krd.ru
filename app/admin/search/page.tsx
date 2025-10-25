import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import VipBadge from '@/components/VipBadge'

export default async function AdminSearchPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) return <div className="container py-6">Доступ запрещён</div>

  const sp = (searchParams ? await searchParams : {}) as Record<string, string>
  const q = (sp.q || '').trim()
  const tab = sp.tab || 'users'

  let users: any[] = []
  let orgs: any[] = []
  let branches: any[] = []
  let requests: any[] = []
  let payments: any[] = []
  let vipUsers: any[] = []

  if (q) {
    if (tab === 'users') {
      users = await prisma.user.findMany({
        where: {
          OR: [
            { email: { contains: q } },
            { name: { contains: q } },
          ],
        },
        orderBy: [
          { featuredSuper: 'desc' as any },
          { featured: 'desc' as any },
          { createdAt: 'desc' as any },
        ],
        take: 50,
      })
    } else if (tab === 'orgs') {
      orgs = await prisma.company.findMany({
        where: { name: { contains: q } },
        orderBy: { name: 'asc' },
        take: 50,
      })
    } else if (tab === 'branches') {
      branches = await prisma.branch.findMany({
        where: { name: { contains: q } },
        include: { company: true },
        orderBy: { name: 'asc' },
        take: 50,
      })
    } else if (tab === 'requests') {
      const mem = await (prisma as any).organizationMembershipRequest.findMany({
        where: {
          OR: [
            { leaderEmail: { contains: q } },
            { requester: { email: { contains: q } } },
          ],
        },
        include: { requester: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      const exp = await (prisma as any).organizationExpansionRequest.findMany({
        where: {
          OR: [
            { company: { name: { contains: q } } },
            { requester: { email: { contains: q } } },
          ],
        },
        include: { company: true, requester: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
      requests = [...mem.map((r:any)=>({ kind:'membership', r })), ...exp.map((r:any)=>({ kind:'expansion', r }))]
    } else if (tab === 'payments') {
      payments = await prisma.payment.findMany({
        where: {
          OR: [
            { id: { contains: q } as any },
            { parent: { user: { email: { contains: q } } } },
          ],
        },
        include: { parent: { include: { user: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }) as any
    } else if (tab === 'vip') {
      vipUsers = await prisma.user.findMany({
        where: { role: 'LOGOPED', OR: [{ featured: true }, { featuredSuper: true }], AND: [
          {
            OR: [
              { email: { contains: q } },
              { name: { contains: q } },
            ],
          },
        ] },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    }
  }

  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Админ · Поиск</h1>
      <form method="get" className="flex items-end gap-2">
        <label className="grid gap-1">
          <span className="text-sm">Запрос</span>
          <input name="q" className="input" defaultValue={q} placeholder="email, имя, организация, филиал" />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Раздел</span>
          <select name="tab" className="input !py-2 !px-2" defaultValue={tab}>
            <option value="users">Пользователи</option>
            <option value="orgs">Организации</option>
            <option value="branches">Филиалы</option>
            <option value="requests">Заявки</option>
            <option value="payments">Платежи</option>
            <option value="vip">VIP</option>
          </select>
        </label>
        <button className="btn">Найти</button>
      </form>

      {tab === 'users' && (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="rounded border p-2" style={{ background: 'var(--card-bg)' }}>
              <div className="font-medium flex items-center gap-2 flex-wrap">{u.name || '—'} {(u as any).role==='LOGOPED' && ((u as any).featuredSuper || (u as any).featured) && (
                <VipBadge level={(u as any).featuredSuper ? 'VIP+' : 'VIP'} />
              )} <span className="text-muted">· {u.email}</span></div>
              <div className="text-xs text-muted">Роль: {(u as any).role}</div>
              <div className="text-xs"><a className="underline" href={`/admin/users?edit=${u.id}`}>Открыть</a></div>
            </div>
          ))}
          {!q && <div className="text-sm text-muted">Введите запрос и нажмите Найти</div>}
          {q && users.length === 0 && <div className="text-sm text-muted">Ничего не найдено</div>}
        </div>
      )}

      {tab === 'orgs' && (
        <div className="space-y-2">
          {orgs.map(o => (
            <div key={o.id} className="rounded border p-2" style={{ background: 'var(--card-bg)' }}>
              <div className="font-medium">{o.name}</div>
              <div className="text-xs text-muted">Лимиты: филиалы {(o as any).allowedBranches ?? 0}, логопеды {(o as any).allowedLogopeds ?? 0}</div>
              <div className="text-xs"><a className="underline" href={`/admin/organizations?q=${encodeURIComponent((o as any).name)}`}>Открыть</a></div>
            </div>
          ))}
          {!q && <div className="text-sm text-muted">Введите запрос и нажмите Найти</div>}
          {q && orgs.length === 0 && <div className="text-sm text-muted">Ничего не найдено</div>}
        </div>
      )}

      {tab === 'branches' && (
        <div className="space-y-2">
          {branches.map(b => (
            <div key={b.id} className="rounded border p-2" style={{ background: 'var(--card-bg)' }}>
              <div className="font-medium">{b.name} <span className="text-muted">· {(b as any).company?.name}</span></div>
              <div className="text-xs"><a className="underline" href={`/admin/branches?companyId=${(b as any).companyId}`}>Открыть</a></div>
            </div>
          ))}
          {!q && <div className="text-sm text-muted">Введите запрос и нажмите Найти</div>}
          {q && branches.length === 0 && <div className="text-sm text-muted">Ничего не найдено</div>}
        </div>
      )}

      {tab === 'requests' && (
        <div className="space-y-2">
          {requests.map((x, i) => (
            <div key={i} className="rounded border p-2" style={{ background: 'var(--card-bg)' }}>
              {x.kind === 'membership' ? (
                <>
                  <div className="font-medium">Заявка на вступление</div>
                  <div className="text-xs text-muted">Запросил: {x.r.requester?.email || '—'} · Руководитель: {x.r.leaderEmail || '—'} · Статус: {x.r.status}</div>
                  <div className="text-xs"><a className="underline" href={`/admin/org-requests`}>Открыть</a></div>
                </>
              ) : (
                <>
                  <div className="font-medium">Заявка на расширение</div>
                  <div className="text-xs text-muted">Орг.: {x.r.company?.name || '—'} · Запросил: {x.r.requester?.email || '—'} · Тип: {x.r.type} · Статус: {x.r.status}</div>
                  <div className="text-xs"><a className="underline" href={`/admin/organizations?q=${encodeURIComponent(x.r.company?.name || '')}`}>Открыть</a></div>
                </>
              )}
            </div>
          ))}
          {!q && <div className="text-sm text-muted">Введите запрос и нажмите Найти</div>}
          {q && requests.length === 0 && <div className="text-sm text-muted">Ничего не найдено</div>}
        </div>
      )}

      {tab === 'payments' && (
        <div className="space-y-2">
          {payments.map(p => (
            <div key={p.id} className="rounded border p-2" style={{ background: 'var(--card-bg)' }}>
              <div className="font-medium">Платеж #{p.id.slice(0,8)} <span className="text-muted">· {p.parent?.user?.email || '—'}</span></div>
              <div className="text-xs text-muted">Сумма: {p.amount ?? '—'} · Статус: {p.status || '—'} · {new Date(p.createdAt).toLocaleString('ru-RU')}</div>
            </div>
          ))}
          {!q && <div className="text-sm text-muted">Введите запрос и нажмите Найти</div>}
          {q && payments.length === 0 && <div className="text-sm text-muted">Ничего не найдено</div>}
        </div>
      )}

      {tab === 'vip' && (
        <div className="space-y-2">
          {vipUsers.map(u => (
            <div key={u.id} className="rounded border p-2" style={{ background: 'var(--card-bg)' }}>
              <div className="font-medium flex items-center gap-2 flex-wrap">{u.name || '—'} {(u as any).featuredSuper || (u as any).featured ? (
                <VipBadge level={(u as any).featuredSuper ? 'VIP+' : 'VIP'} />
              ) : null} <span className="text-muted">· {u.email}</span></div>
              <div className="text-xs text-muted">Роль: {(u as any).role}</div>
              <div className="text-xs"><a className="underline" href={`/admin/users?edit=${u.id}`}>Открыть</a></div>
            </div>
          ))}
          {!q && <div className="text-sm text-muted">Введите запрос и нажмите Найти</div>}
          {q && vipUsers.length === 0 && <div className="text-sm text-muted">Ничего не найдено</div>}
        </div>
      )}
    </div>
  )
}
