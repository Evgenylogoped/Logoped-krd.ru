import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createPass, refundPassRemainder, closePassIfZero } from './actions'
import BranchSelector from '@/components/finance/BranchSelector'
import ConfirmButton from '@/components/forms/ConfirmButton'

export default async function AdminFinancePassesPage({ searchParams }: { searchParams?: Promise<{ branch?: string }> }) {
  const sp = (searchParams ? await searchParams : {}) as { branch?: string }
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

  const branchFilterId = String((sp?.branch || '')).trim()
  // Текущий пользователь (для branchId в нелидерах)
  const me = await (prisma as any).user.findUnique({ where: { id: adminId }, select: { branchId: true } })
  // Список филиалов для селектора
  let branches: { id: string; name: string }[] = []
  if (['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) {
    branches = await (prisma as any).branch.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 })
  } else {
    const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: adminId }, select: { id: true } })
    if (ownedCompany) branches = await (prisma as any).branch.findMany({ where: { companyId: ownedCompany.id }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 })
    else if (me?.branchId) branches = await (prisma as any).branch.findMany({ where: { id: me.branchId }, select: { id: true, name: true } })
  }

  const whereChild: any = {}
  const wherePass: any = {}
  if (branchFilterId) {
    whereChild.logoped = { branchId: branchFilterId }
    wherePass.logoped = { branchId: branchFilterId }
  } else if (!['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role) && me?.branchId) {
    whereChild.logoped = { branchId: me.branchId }
    wherePass.logoped = { branchId: me.branchId }
  }

  const children = await (prisma as any).child.findMany({ where: whereChild, include: { parent: { include: { user: true } }, logoped: true }, orderBy: { lastName: 'asc' } })
  const passes = await (prisma as any).pass.findMany({ where: wherePass, include: { child: { include: { parent: { include: { user: true } } } }, logoped: true }, orderBy: { createdAt: 'desc' } })

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-3xl font-bold">Абонементы</h1>
        {branches.length>0 && (
          <BranchSelector branches={branches} allLabel="Все филиалы" param="branch" />
        )}
      </div>

      <section className="section">
        <h2 className="text-lg font-semibold mb-2">Создать абонемент</h2>
        <div className="flex items-center justify-between gap-2 mb-2">
          {branches.length>0 && (
            <BranchSelector branches={branches} allLabel="Все филиалы" param="branch" />
          )}
        </div>
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
                <th className="py-2 pr-4 hidden sm:table-cell">Логопед</th>
                <th className="py-2 pr-4">Всего</th>
                <th className="py-2 pr-4">Осталось</th>
                <th className="py-2 pr-4 hidden sm:table-cell">Сумма</th>
                <th className="py-2 pr-4 hidden sm:table-cell">Цена/зан.</th>
                <th className="py-2 pr-4 hidden sm:table-cell">Действует до</th>
                <th className="py-2 pr-4">Статус</th>
                <th className="py-2 pr-4">Действия</th>
              </tr>
            </thead>
            <tbody>
              {passes.length===0 && (
                <tr><td colSpan={9} className="py-3 text-muted">Абонементов нет</td></tr>
              )}
              {passes.map((p: any) => (
                <tr key={p.id} className="border-t">
                  <td className="py-2 pr-4">{new Date(p.createdAt).toLocaleDateString('ru-RU')}</td>
                  <td className="py-2 pr-4">{p.child?.lastName} {p.child?.firstName}</td>
                  <td className="py-2 pr-4 hidden sm:table-cell">{p.logoped?.name || p.logoped?.email || '—'}</td>
                  <td className="py-2 pr-4">{p.totalLessons}</td>
                  <td className="py-2 pr-4">{p.remainingLessons}</td>
                  <td className="py-2 pr-4 hidden sm:table-cell">{Number(p.totalPrice||0).toLocaleString('ru-RU')} ₽</td>
                  <td className="py-2 pr-4 hidden sm:table-cell">{Math.round(Number(p.totalPrice||0)/Math.max(1, Number(p.totalLessons||1))).toLocaleString('ru-RU')} ₽</td>
                  <td className="py-2 pr-4 hidden sm:table-cell">{p.validUntil ? new Date(p.validUntil).toLocaleDateString('ru-RU') : '—'}</td>
                  <td className="py-2 pr-4">{p.status}</td>
                  <td className="py-2 pr-4">
                    {p.status==='ACTIVE' && Number(p.remainingLessons)>0 && (
                      <form id={`refund-form-${p.id}`} action={refundPassRemainder} method="post">
                        <input type="hidden" name="passId" value={p.id} />
                        <ConfirmButton formId={`refund-form-${p.id}`} text="Вернуть остаток" className="btn btn-outline btn-xs" confirmMessage="Вернуть остаток и закрыть абонемент?" />
                      </form>
                    )}
                    {p.status==='ACTIVE' && Number(p.remainingLessons)===0 && (
                      <form id={`closezero-form-${p.id}`} action={closePassIfZero} method="post">
                        <input type="hidden" name="passId" value={p.id} />
                        <ConfirmButton formId={`closezero-form-${p.id}`} text="Закрыть при 0" className="btn btn-outline btn-xs" confirmMessage="Закрыть абонемент (остаток 0)?" />
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
