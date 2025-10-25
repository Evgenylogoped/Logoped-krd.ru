import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { backfillLeaderLinks, archiveScopeTransactions, purgeOldArchives } from './actions'
import Link from 'next/link'

export default async function AdminFinanceDashboardPage({ searchParams }: { searchParams?: Promise<{ backfilled?: string; lessons?: string; tx?: string; archived?: string; purged?: string; count?: string }> }) {
  const sp = (searchParams ? await searchParams : {}) as { backfilled?: string; lessons?: string; tx?: string; archived?: string; purged?: string; count?: string }
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const adminId = (session?.user as any)?.id
  if (!session) return <div className="container py-6">Доступ запрещён</div>
  let allowed = ['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)
  if (!allowed && role === 'LOGOPED') {
    const meGuard = await (prisma as any).user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
    const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: adminId }, select: { id: true } })
    const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: adminId }, select: { id: true } })
    const isOwnerGuard = Boolean(meGuard?.branch?.company?.ownerId === adminId) || Boolean(ownedCompany)
    const isBranchManagerGuard = Boolean(meGuard?.branch?.managerId === adminId) || Boolean(managesAny)
    allowed = isOwnerGuard || isBranchManagerGuard
  }
  if (!allowed) return <div className="container py-6">Доступ запрещён</div>

  // Определяем контур: владелец компании и руководитель филиала — ТОЛЬКО свой филиал; бухгалтер — все компании
  const me = await (prisma as any).user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
  const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: adminId }, select: { id: true } })
  const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: adminId }, select: { id: true } })
  const isOwner = Boolean(me?.branch?.company?.ownerId === adminId) || Boolean(ownedCompany)
  const isBranchManager = Boolean(me?.branch?.managerId === adminId) || Boolean(managesAny)

  const branchScopeId = (role === 'ACCOUNTANT') ? undefined : (isOwner || isBranchManager) ? me?.branchId : undefined

  // where-фильтры транзакций по branchId (заполняется в services/finance.ts)
  const txWhereBase: any = {}
  if (branchScopeId) txWhereBase.branchId = branchScopeId
  // Руководители: личные занятия считаются как SOLO, исключаем их из орг-агрегатов
  if (role !== 'ACCOUNTANT') {
    (txWhereBase as any).lesson = { is: { logopedId: { not: adminId } } }
  }

  // where-фильтр для абонементов: ребёнок закреплён за логопедом нужного филиала
  const passWhereBase: any = {}
  if (branchScopeId) passWhereBase.child = { logoped: { branchId: branchScopeId } }

  let therapistBalance: any, cashHeld: any, revenueTx: any, subscriptions: any
  try {
    ;[therapistBalance, cashHeld, revenueTx, subscriptions] = await Promise.all([
      (prisma as any).transaction.aggregate({ where: { kind: 'THERAPIST_BALANCE', archivedAt: null, ...txWhereBase }, _sum: { amount: true } }),
      (prisma as any).transaction.aggregate({ where: { kind: 'CASH_HELD', archivedAt: null, ...txWhereBase }, _sum: { amount: true } }),
      (prisma as any).transaction.aggregate({ where: { kind: 'REVENUE', archivedAt: null, ...txWhereBase }, _sum: { amount: true } }),
      (prisma as any).pass.aggregate({ where: passWhereBase, _sum: { totalPrice: true } }),
    ])
  } catch (e) {
    // Fallback на случай отсутствия поля archivedAt (миграция ещё не применена)
    ;[therapistBalance, cashHeld, revenueTx, subscriptions] = await Promise.all([
      (prisma as any).transaction.aggregate({ where: { kind: 'THERAPIST_BALANCE', ...txWhereBase }, _sum: { amount: true } }),
      (prisma as any).transaction.aggregate({ where: { kind: 'CASH_HELD', ...txWhereBase }, _sum: { amount: true } }),
      (prisma as any).transaction.aggregate({ where: { kind: 'REVENUE', ...txWhereBase }, _sum: { amount: true } }),
      (prisma as any).pass.aggregate({ where: passWhereBase, _sum: { totalPrice: true } }),
    ])
  }
  const balance = Number(therapistBalance._sum?.amount || 0)
  const cash = Number(cashHeld._sum?.amount || 0)
  const revenue = Number(revenueTx._sum?.amount || 0)
  const subsTotal = Number(subscriptions._sum?.totalPrice || 0)

  return (
    <div className="container py-6 space-y-6">
      <h1 className="text-3xl font-bold">Дашборд</h1>
      {sp?.backfilled === '1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800">
          Связи выровнены: уроков обновлено — {Number(sp?.lessons||0)}, транзакций обновлено — {Number(sp?.tx||0)}.
        </div>
      )}
      {sp?.archived === '1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800">
          В архив перенесено транзакций: {Number(sp?.count||0)}.
        </div>
      )}
      {sp?.purged === '1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800">
          Удалено из архива транзакций старше 6 месяцев: {Number(sp?.count||0)}.
        </div>
      )}
      <div className="rounded border p-3 bg-amber-50 text-amber-900 flex items-center justify-between">
        <div className="text-sm">Кнопку «Выравнивание связей» используйте, когда необходимо привести старые данные к актуальным связям (уроки ↔ филиал, транзакции ↔ филиал/компания). Архив удаляется через 6 месяцев безвозвратно.</div>
        <form action={backfillLeaderLinks}>
          <button className="btn btn-warning btn-sm">Выравнивание связей</button>
        </form>
      </div>
      <section className="grid gap-3 sm:grid-cols-4">
        <div className="card p-3">
          <div className="text-xs text-muted">Сумма к выплате логопедам</div>
          <div className="text-2xl font-semibold">{balance.toLocaleString('ru-RU')} ₽</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Долг логопедов руководителю</div>
          <div className="text-2xl font-semibold">{cash.toLocaleString('ru-RU')} ₽</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Онлайн/касса выручка (tx)</div>
          <div className="text-2xl font-semibold">{revenue.toLocaleString('ru-RU')} ₽</div>
        </div>
        <div className="card p-3">
          <div className="text-xs text-muted">Продажи абонементов (сумма)</div>
          <div className="text-2xl font-semibold">{subsTotal.toLocaleString('ru-RU')} ₽</div>
        </div>
      </section>
      <section className="grid gap-3">
        <div className="card p-3 space-y-3">
          <div className="text-sm font-medium">Архивирование текущего контура</div>
          <form action={archiveScopeTransactions} className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="block text-xs mb-1">С</label>
              <input type="date" name="start" className="input" required />
            </div>
            <div>
              <label className="block text-xs mb-1">По</label>
              <input type="date" name="end" className="input" required />
            </div>
            <button className="btn btn-warning">В архив</button>
          </form>
          <form action={purgeOldArchives}>
            <button className="btn btn-outline btn-sm">Удалить из архива записи старше 6 месяцев</button>
          </form>
          <div>
            <Link href="/admin/finance/archive" className="btn btn-link btn-sm">Открыть архив →</Link>
          </div>
        </div>
      </section>
    </div>
  )
}
