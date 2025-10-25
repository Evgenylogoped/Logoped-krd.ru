import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import Link from 'next/link'
import { prisma } from '@/lib/prisma'

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(role)) return <div>Доступ запрещён</div>

  const [users, parents, lessons, payments] = await Promise.all([
    prisma.user.count(),
    prisma.parent.count(),
    prisma.lesson.count(),
    prisma.payment.count(),
  ])

  return (
    <div className="container space-y-6 py-6">
      <h1 className="text-3xl font-bold">Админ‑панель</h1>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card">
          <div className="text-sm text-muted">Пользователи</div>
          <div className="text-2xl font-bold">{users}</div>
        </div>
        <div className="card">
          <div className="text-sm text-muted">Родители</div>
          <div className="text-2xl font-bold">{parents}</div>
        </div>
        <div className="card">
          <div className="text-sm text-muted">Занятия</div>
          <div className="text-2xl font-bold">{lessons}</div>
        </div>
        <div className="card">
          <div className="text-sm text-muted">Платежи</div>
          <div className="text-2xl font-bold">{payments}</div>
        </div>
      </section>

      <section className="section">
        <h2 className="mb-2 text-lg font-semibold">Быстрые ссылки</h2>
        <div className="flex flex-wrap gap-2">
          <Link className="btn" href="/admin/companies">Компании</Link>
          <Link className="btn" href="/admin/branches">Филиалы</Link>
          <Link className="btn" href="/admin/groups">Группы</Link>
          <Link className="btn" href="/admin/contracts">Договоры</Link>
          <Link className="btn" href="/admin/payments">Платежи</Link>
          <Link className="btn" href="/admin/users">Пользователи</Link>
        </div>
      </section>
    </div>
  )
}
