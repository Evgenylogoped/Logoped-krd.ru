import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createPass } from './actions'

export default async function AdminFinancePassesPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const adminId = (session?.user as any)?.id
  if (!session) return <div className="container py-6">Доступ запрещён</div>
  let allowed = ['ADMIN','SUPER_ADMIN'].includes(role)
  if (!allowed && role === 'LOGOPED') {
    const meGuard = await (prisma as any).user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
    const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: adminId }, select: { id: true } })
    const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: adminId }, select: { id: true } })
    const isOwnerGuard = Boolean(meGuard?.branch?.company?.ownerId === adminId) || Boolean(ownedCompany)
    const isBranchManagerGuard = Boolean(meGuard?.branch?.managerId === adminId) || Boolean(managesAny)
    allowed = isOwnerGuard || isBranchManagerGuard
  }
  if (!allowed) return <div className="container py-6">Доступ запрещён</div>

  const children = await (prisma as any).child.findMany({ include: { parent: { include: { user: true } }, logoped: true }, orderBy: { lastName: 'asc' } })
  const passes = await (prisma as any).pass.findMany({ include: { child: { include: { parent: { include: { user: true } } } }, logoped: true }, orderBy: { createdAt: 'desc' } })

  return (
    <div className="container py-6 space-y-6">
      <h1 className="text-3xl font-bold">Абонементы</h1>

      <section className="section">
        <h2 className="text-lg font-semibold mb-2">Создать абонемент</h2>
        <form action={createPass} className="grid gap-2 sm:grid-cols-5">
          <select name="childId" className="input !py-2 !px-2">
            {children.map((c: any) => (
              <option key={c.id} value={c.id}>{c.lastName} {c.firstName} · {c.parent?.user?.email}</option>
            ))}
          </select>
          <input name="totalLessons" type="number" min={1} className="input" placeholder="Кол-во занятий (напр. 4/8/16)" />
          <input name="totalPrice" type="number" min={0} step={0.01} className="input" placeholder="Сумма, ₽" />
          <input name="validUntil" type="date" className="input" />
          <button className="btn btn-primary">Создать</button>
        </form>
      </section>

      <section className="section">
        <h2 className="text-lg font-semibold mb-2">Список</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2 pr-4">Дата</th>
                <th className="py-2 pr-4">Ребёнок</th>
                <th className="py-2 pr-4">Логопед</th>
                <th className="py-2 pr-4">Всего</th>
                <th className="py-2 pr-4">Осталось</th>
                <th className="py-2 pr-4">Сумма</th>
                <th className="py-2 pr-4">Действует до</th>
                <th className="py-2 pr-4">Статус</th>
              </tr>
            </thead>
            <tbody>
              {passes.length===0 && (
                <tr><td colSpan={8} className="py-3 text-muted">Абонементов нет</td></tr>
              )}
              {passes.map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="py-2 pr-4">{new Date(p.createdAt).toLocaleDateString('ru-RU')}</td>
                  <td className="py-2 pr-4">{p.child?.lastName} {p.child?.firstName}</td>
                  <td className="py-2 pr-4">{p.logoped?.name || p.logoped?.email || '—'}</td>
                  <td className="py-2 pr-4">{p.totalLessons}</td>
                  <td className="py-2 pr-4">{p.remainingLessons}</td>
                  <td className="py-2 pr-4">{Number(p.totalPrice||0).toLocaleString('ru-RU')} ₽</td>
                  <td className="py-2 pr-4">{p.validUntil ? new Date(p.validUntil).toLocaleDateString('ru-RU') : '—'}</td>
                  <td className="py-2 pr-4">{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
