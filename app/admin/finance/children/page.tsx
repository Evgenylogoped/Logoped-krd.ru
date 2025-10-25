import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { createPass, refundPassRemainder } from '../passes/actions'
import ConfirmButton from '@/components/forms/ConfirmButton'
import AutoPassPrice from '@/components/finance/AutoPassPrice'
import BranchSelector from '@/components/finance/BranchSelector'

function csvEscape(v: any) {
  const s = (v==null? '': String(v))
  if (s.includes(';') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g,'""') + '"'
  return s
}

export default async function AdminFinanceChildrenPage({ searchParams }: { searchParams: Promise<{ export?: string; branch?: string }> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const adminId = (session?.user as any)?.id
  if (!session) return <div className="container py-6">Доступ запрещён</div>
  const meGuard = await (prisma as any).user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
  const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: adminId }, select: { id: true } })
  const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: adminId }, select: { id: true } })
  const isOwnerGuard = Boolean(meGuard?.branch?.company?.ownerId === adminId) || Boolean(ownedCompany)
  const isBranchManagerGuard = Boolean(meGuard?.branch?.managerId === adminId) || Boolean(managesAny)
  let allowed = ['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role) || isOwnerGuard || isBranchManagerGuard
  if (!allowed) return <div className="container py-6">Доступ запрещён</div>

  const me = meGuard
  const isOwner = isOwnerGuard
  const isBranchManager = isBranchManagerGuard

  const branchScopeId = (role === 'ACCOUNTANT') ? undefined : (isOwner || isBranchManager) ? me?.branchId : undefined
  const branchFilterId = String((sp as any)?.branch || '').trim()

  // Подготовим список филиалов для селектора (админ/бух/владелец)
  let branches: { id: string; name: string }[] = []
  if (['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) {
    branches = await (prisma as any).branch.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 })
  } else if (isOwner) {
    const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: adminId }, select: { id: true } })
    if (ownedCompany) branches = await (prisma as any).branch.findMany({ where: { companyId: ownedCompany.id }, select: { id: true, name: true }, orderBy: { name: 'asc' }, take: 200 })
  }

  const whereChildren: any = { isArchived: false }
  if (role === 'ACCOUNTANT') {
    // бухгалтер — все дети
    if (branchFilterId) whereChildren.logoped = { branchId: branchFilterId }
  } else if (branchScopeId) {
    // руководитель/владелец: дети филиала ИЛИ личные дети руководителя (solo)
    const targetBranch = branchFilterId || branchScopeId
    whereChildren.OR = [
      { logoped: { branchId: targetBranch } },
      { logopedId: adminId },
    ]
  } else {
    // на всякий случай — только личные
    whereChildren.logopedId = adminId
  }

  const children = await (prisma as any).child.findMany({
    where: whereChildren,
    include: {
      logoped: { select: { id: true, name: true, email: true, branchId: true, lessonPrice: true, branch: { select: { id: true, name: true } } } },
      passes: { where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  // Подготовка CSV при запросе export=1
  const doExport = String((sp?.export || '') as any) === '1'
  let csv: string | null = null
  if (doExport) {
    const header = ['Ребёнок','Логопед','Филиал','Цена занятия','Активный абонемент','Остаток','Всего занятий'].join(';')
    const rows = await Promise.all(children.map(async (c: any) => {
      const pass = c.passes?.[0] || null
      let branchName = ''
      if (c.logoped?.branchId) {
        const br = await prisma.branch.findUnique({ where: { id: c.logoped.branchId } }) as any
        branchName = br?.name || c.logoped.branchId
      }
      return [
        `${c.lastName} ${c.firstName}`,
        (c.logoped?.name || c.logoped?.email || ''),
        branchName,
        (c.rateLesson!=null ? Number(c.rateLesson).toString() : ''),
        (pass ? 'Да' : 'Нет'),
        (pass ? String(pass.remainingLessons) : ''),
        (pass ? String(pass.totalLessons) : ''),
      ].map(csvEscape).join(';')
    }))
    csv = [header, ...rows].join('\n')
    return (
      <div className="container py-6 space-y-4">
        <h1 className="text-3xl font-bold">Дети — экспорт CSV</h1>
        <div>
          <Link href="/admin/finance/children" className="btn btn-outline btn-sm">← Назад к списку</Link>
        </div>
        <div className="text-sm text-muted">Скопируйте содержимое в CSV-файл:</div>
        <textarea className="input w-full min-h-[300px]" readOnly defaultValue={csv} />
      </div>
    )
  }

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-3xl font-bold">Дети подчинённых</h1>
        <div className="flex gap-2 items-center">
          {branches.length>0 && (
            <BranchSelector branches={branches} allLabel="Все филиалы" param="branch" />
          )}
          <a href="?export=1" className="btn btn-outline btn-sm">Экспорт CSV</a>
        </div>
      </div>
      {(() => { const scopeText = role==='ACCOUNTANT' ? 'все компании' : (branchScopeId ? 'ваш филиал' : 'личный доступ запрещён'); return (
        <div className="text-sm text-muted">В списке отображаются дети логопедов в вашем контуре: {scopeText}.</div>
      )})()}

      {(sp as any)?.ok==='1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-900 text-sm">Абонемент выдан.</div>
      )}
      {(sp as any)?.err && (
        <div className="rounded border p-3 bg-red-50 text-red-800 text-sm">Ошибка: {(sp as any).err}</div>
      )}

      <div className="overflow-x-auto card-table p-3">
        <table className="min-w-full text-sm table-zebra leading-tight">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-4">Ребёнок</th>
              <th className="py-2 pr-4">Логопед</th>
              <th className="py-2 pr-4 hidden sm:table-cell">Филиал</th>
              <th className="py-2 pr-4 text-right hidden sm:table-cell">Цена занятия</th>
              <th className="py-2 pr-4">Абонемент</th>
              <th className="py-2 pr-4">Быстро выдать абонемент</th>
            </tr>
          </thead>
          <tbody>
            {children.length===0 && (
              <tr><td colSpan={6} className="py-3 text-muted">Нет данных</td></tr>
            )}
            {children.map((c: any) => {
              const pass = c.passes?.[0] || null
              return (
                <tr key={c.id} className="align-top">
                  <td className="py-2 pr-4">{c.lastName} {c.firstName}</td>
                  <td className="py-2 pr-4">{c.logoped?.name || c.logoped?.email || '—'}</td>
                  <td className="py-2 pr-4 hidden sm:table-cell">{c.logoped?.branch?.name || (c.logoped?.branchId ? 'Основной офис' : '—')}</td>
                  <td className="py-2 pr-4 text-right hidden sm:table-cell">{c.rateLesson!=null ? `${Number(c.rateLesson).toLocaleString('ru-RU')} ₽` : '—'}</td>
                  <td className="py-2 pr-4">
                    {pass ? (
                      <div className="text-xs space-y-1">
                        <div>Осталось: <b>{pass.remainingLessons}</b> из {pass.totalLessons}</div>
                        {pass.validUntil && <div>До: {new Date(pass.validUntil).toLocaleDateString('ru-RU')}</div>}
                        <div>Цена по абонементу: <b>{Math.round(Number(pass.totalPrice||0)/Math.max(1, Number(pass.totalLessons||1))).toLocaleString('ru-RU')} ₽</b></div>
                        {pass.status==='ACTIVE' && Number(pass.remainingLessons)>0 && (
                          <form id={`refund-form-${pass.id}`} action={refundPassRemainder}>
                            <input type="hidden" name="passId" value={pass.id} />
                            <ConfirmButton formId={`refund-form-${pass.id}`} text="Вернуть остаток" className="btn btn-outline btn-xs" confirmMessage="Вернуть остаток и закрыть абонемент?" />
                          </form>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-muted">Нет активного абонемента</div>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {(() => {
                      const formId = `pass-form-${c.id}`
                      const unit = (c.rateLesson!=null ? Number(c.rateLesson) : Number(c.logoped?.lessonPrice || 0))
                      return (
                        <form id={formId} action={createPass} className="grid gap-1 sm:grid-cols-5 items-end">
                          <input type="hidden" name="childId" value={c.id} />
                          <input type="hidden" name="logopedId" value={c.logoped?.id || ''} />
                          <div className="sm:col-span-2">
                            <AutoPassPrice basePrice={Number(unit||0)} formId={formId} />
                          </div>
                          <div><input name="validUntil" type="date" className="input" /></div>
                          <div className="sm:col-span-5"><button className="btn btn-secondary btn-sm">Выдать</button></div>
                        </form>
                      )
                    })()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
