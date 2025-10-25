import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { setCommissionRate } from './actions'
import { getCurrentCommissionPercent } from '@/services/finance'

export default async function AdminFinanceCommissionsPage() {
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

  // Определяем скоуп подчинённых
  const me = await (prisma as any).user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
  let whereLogopeds: any = { role: 'LOGOPED' }
  if (!['ADMIN','SUPER_ADMIN'].includes(role)) {
    // владелец/руководитель видит логопедов своего филиала (или всех филиалов компании — упростим до своего филиала)
    if (me?.branchId) whereLogopeds.branchId = me.branchId
  }
  const logopeds = await (prisma as any).user.findMany({ where: whereLogopeds, orderBy: { name: 'asc' } })

  // Получим текущий процент для каждого логопеда (по умолчанию 50)
  const percents = await Promise.all(logopeds.map(async (u: any) => ({ id: u.id, p: await getCurrentCommissionPercent(u.id) })))
  const pById = new Map(percents.map(x => [x.id, x.p]))

  const options = [80,70,60,50,40,30,20] // therapist percent
  const nowIsoLocal = new Date().toISOString()

  // Состояние взаиморасчётов по каждому логопеду: незакрытые уроки и остаток
  const guards = await Promise.all(logopeds.map(async (u: any) => {
    // eligibleCount: только орг-уроки (не персональные)
    const lessons = await (prisma as any).lesson.findMany({
      where: { logopedId: u.id, settledAt: { not: null, lt: new Date() }, payoutStatus: 'NONE' },
      include: { transactions: { select: { meta: true } } },
      take: 200,
    })
    const eligible = (lessons as any[]).filter(L => (L.transactions||[]).some((t:any)=> t && (t.meta?.personal !== true)))
    const eligibleCount = eligible.length
    const [b, c, p] = await Promise.all([
      (prisma as any).transaction.aggregate({ where: { userId: u.id, kind: 'THERAPIST_BALANCE' }, _sum: { amount: true } }),
      (prisma as any).transaction.aggregate({ where: { userId: u.id, kind: 'CASH_HELD' }, _sum: { amount: true } }),
      (prisma as any).transaction.aggregate({ where: { userId: u.id, kind: 'PAYOUT' }, _sum: { amount: true } }),
    ])
    const net = Number(b._sum?.amount||0) - Number(c._sum?.amount||0) - Number(p._sum?.amount||0)
    const eps = 0.5
    const blocked = Math.abs(net) > eps || eligibleCount > 0
    return { id: u.id, eligibleCount, net: Math.round(net), blocked }
  }))
  const guardById = new Map(guards.map(g=> [g.id, g]))
  const anyBlocked = guards.some(g=> g.blocked)

  return (
    <div className="container py-6 space-y-6">
      <h1 className="text-3xl font-bold">Проценты логопедов</h1>

      <section className="section">
        {anyBlocked && (
          <div className="rounded border p-3 bg-amber-50 text-amber-900 text-sm mb-3">
            Проценты! У некоторых логопедов нельзя менять процент: есть незакрытые занятия или остаток по взаиморасчётам.
          </div>
        )}
        <div className="overflow-x-auto card-table p-3">
          <table className="min-w-full text-sm table-zebra leading-tight">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2 pr-4">Логопед</th>
                <th className="py-2 pr-4">Процент р/л</th>
                <th className="py-2 pr-4">Статус взаиморасчёта</th>
                <th className="py-2 pr-4">Изменить р/л</th>
                <th className="py-2 pr-4">Сохранить</th>
              </tr>
            </thead>
            <tbody>
              {logopeds.length===0 && (
                <tr><td colSpan={4} className="py-3 text-muted">Нет подчинённых логопедов</td></tr>
              )}
              {logopeds.map((u: any) => {
                const therapist = Number(pById.get(u.id) || 50)
                const leader = 100 - therapist
                const g = guardById.get(u.id) || { eligibleCount: 0, net: 0, blocked: false }
                return (
                  <tr key={u.id}>
                    <td className="py-2 pr-4">{u.name || u.email}</td>
                    <td className="py-2 pr-4">{leader}% / {therapist}%</td>
                    <td className="py-2 pr-4">
                      {g.blocked ? (
                        <span className="text-red-600 text-xs">Незакрытых: {g.eligibleCount}; Остаток: {g.net.toLocaleString('ru-RU')} ₽</span>
                      ) : (
                        <span className="text-emerald-600 text-xs">OK</span>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <form action={setCommissionRate} className="flex gap-2 items-center">
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="validFrom" value={nowIsoLocal} />
                        <select name="percent" defaultValue={String(therapist)} className="input default-select" disabled={g.blocked}>
                          {options.map(p => (
                            <option key={p} value={p}>{100-p}% / {p}%</option>
                          ))}
                        </select>
                        <button className="btn btn-primary btn-sm" disabled={g.blocked}>Сохранить</button>
                      </form>
                    </td>
                    <td className="py-2 pr-4">
                      {/* Кнопка продублирована в форме «Изменить» для UX; эту колонку оставим пустой для выравнивания */}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
