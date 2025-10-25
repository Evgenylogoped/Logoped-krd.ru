import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createBranch, updateBranch, deleteBranch, assignBranchManager, revokeBranchManager } from './actions'

export default async function BranchesPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(role)) return <div>Доступ запрещён</div>

  const sp = (searchParams ? await searchParams : {}) as Record<string, string>
  const companies = await prisma.company.findMany({ orderBy: { name: 'asc' } })
  const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' }, include: { company: true } })

  return (
    <div className="container space-y-6 py-6">
      <h1 className="text-3xl font-bold">Филиалы</h1>
      {sp?.err === 'branches_limit' && (
        <div className="rounded border p-3 bg-red-50 text-red-700 text-sm">
          Достигнут лимит филиалов. Увеличьте план в разделе <a href="/settings/billing" className="underline">Настройки → Подписка</a>.
        </div>
      )}

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Добавить филиал</h2>
        <form action={createBranch} className="grid gap-3 sm:grid-cols-4">
          <select name="companyId" className="input !py-2 !px-2" required>
            <option value="">Компания…</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input name="name" placeholder="Название" className="input" required />
          <input name="address" placeholder="Адрес" className="input" />
          <button className="btn">Сохранить</button>
        </form>
        <div className="text-xs text-muted mt-2">
          На бесплатном плане доступно до 2 филиалов. Для увеличения лимита перейдите в{' '}
          <a href="/settings/billing" className="underline">Настройки → Подписка</a>.
        </div>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Список</h2>
        <div className="space-y-2">
          {branches.map(b => (
            <div key={b.id} className="flex flex-col gap-2 p-3 rounded-md border shadow-sm sm:flex-row sm:items-center sm:justify-between" style={{ background: 'var(--card-bg)' }}>
              <div>
                <div className="font-medium">{b.name} <span className="text-sm text-muted">· {b.company.name}</span></div>
                <div className="text-sm text-muted">{b.address}</div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <form action={updateBranch} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={b.id} />
                  <input name="name" defaultValue={b.name} className="input !py-1 !px-2 text-sm w-auto" />
                  <input name="address" defaultValue={b.address ?? ''} className="input !py-1 !px-2 text-sm w-auto" />
                  <button className="btn text-sm">Обновить</button>
                </form>
                <form action={deleteBranch}>
                  <input type="hidden" name="id" value={b.id} />
                  <button className="btn btn-danger text-sm">Удалить</button>
                </form>
                {/* Назначение/снятие руководителя филиала */}
                <form action={assignBranchManager} className="flex items-center gap-2">
                  <input type="hidden" name="branchId" value={b.id} />
                  <input name="userEmail" type="email" placeholder="Email пользователя" className="input !py-1 !px-2 text-sm w-56" required />
                  <button className="btn-secondary text-sm" type="submit">Назначить руководителя</button>
                </form>
                <form action={revokeBranchManager} className="flex items-center gap-2">
                  <input type="hidden" name="branchId" value={b.id} />
                  <input name="userEmail" type="email" placeholder="Email пользователя" className="input !py-1 !px-2 text-sm w-56" required />
                  <button className="btn-outline text-sm" type="submit">Снять руководителя</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
