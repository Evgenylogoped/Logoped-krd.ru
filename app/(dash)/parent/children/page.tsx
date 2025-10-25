import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createChild, deleteChild } from './actions'

export default async function ParentChildrenPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || role !== 'PARENT') return <div>Доступ запрещён</div>

  const userId = (session.user as any).id as string
  const parent = await prisma.parent.findUnique({ where: { userId }, include: { children: true } })

  return (
    <div className="container space-y-6 py-6">
      <h1 className="text-3xl font-bold">Дети</h1>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Добавить ребёнка</h2>
        <form action={createChild} className="grid gap-3 sm:grid-cols-3">
          <input name="firstName" placeholder="Имя" className="input" required />
          <input name="lastName" placeholder="Фамилия" className="input" required />
          <input name="birthDate" type="date" className="input" />
          <button className="btn btn-primary sm:col-span-3">Сохранить</button>
        </form>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Список</h2>
        <div className="space-y-2">
          {(parent?.children ?? []).length === 0 && (
            <div className="text-sm text-muted">Пока нет детей</div>
          )}
          {(parent?.children ?? []).map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
              <div>
                <div className="font-medium">{c.lastName} {c.firstName}</div>
                {c.birthDate && <div className="text-sm text-muted">Дата рождения: {new Date(c.birthDate).toLocaleDateString('ru-RU')}</div>}
              </div>
              <form action={deleteChild}>
                <input type="hidden" name="id" value={c.id} />
                <button className="btn btn-danger text-sm">Удалить</button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
