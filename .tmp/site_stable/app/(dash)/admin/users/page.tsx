import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateUserRole } from './actions'

export default async function AdminUsersPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(role)) return <div>Доступ запрещён</div>

  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } })

  return (
    <div className="container space-y-6 py-6">
      <h1 className="text-3xl font-bold">Пользователи</h1>
      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Список</h2>
        <div className="space-y-2">
          {users.length === 0 && <div className="text-sm text-muted">Пользователей пока нет</div>}
          {users.map(u => (
            <div key={u.id} className="flex flex-col gap-2 p-3 rounded-md border shadow-sm sm:flex-row sm:items-center sm:justify-between" style={{ background: 'var(--card-bg)' }}>
              <div>
                <div className="font-medium">{u.email}</div>
                <div className="text-sm text-muted">Роль: {u.role}</div>
              </div>
              <form action={updateUserRole} className="flex items-center gap-2">
                <input type="hidden" name="id" value={u.id} />
                <select name="role" defaultValue={u.role} className="input !py-1 !px-2 text-sm w-auto">
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="LOGOPED">LOGOPED</option>
                  <option value="ACCOUNTANT">ACCOUNTANT</option>
                  <option value="PARENT">PARENT</option>
                </select>
                <button className="btn text-sm">Сохранить</button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
