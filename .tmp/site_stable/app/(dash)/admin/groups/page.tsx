import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createGroup, updateGroup, deleteGroup } from './actions'

export default async function GroupsPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(role)) return <div>Доступ запрещён</div>

  const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' }, include: { company: true } })
  const groups = await prisma.group.findMany({ orderBy: { name: 'asc' }, include: { branch: { include: { company: true } } } })

  return (
    <div className="container space-y-6 py-6">
      <h1 className="text-3xl font-bold">Группы</h1>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Добавить группу</h2>
        <form action={createGroup} className="grid gap-3 sm:grid-cols-3">
          <select name="branchId" className="input !py-2 !px-2" required>
            <option value="">Филиал…</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.company.name} · {b.name}</option>
            ))}
          </select>
          <input name="name" placeholder="Название группы" className="input" required />
          <button className="btn btn-primary">Сохранить</button>
        </form>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Список</h2>
        <div className="space-y-2">
          {groups.length === 0 && <div className="text-sm text-muted">Нет групп</div>}
          {groups.map(g => (
            <div key={g.id} className="flex flex-col gap-2 p-3 rounded-md border shadow-sm sm:flex-row sm:items-center sm:justify-between" style={{ background: 'var(--card-bg)' }}>
              <div>
                <div className="font-medium">{g.name} <span className="text-sm text-muted">· {g.branch.company.name} / {g.branch.name}</span></div>
              </div>
              <div className="flex gap-2">
                <form action={updateGroup} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={g.id} />
                  <input name="name" defaultValue={g.name} className="input !py-1 !px-2 text-sm w-auto" />
                  <button className="btn text-sm">Обновить</button>
                </form>
                <form action={deleteGroup}>
                  <input type="hidden" name="id" value={g.id} />
                  <button className="btn btn-danger text-sm">Удалить</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
