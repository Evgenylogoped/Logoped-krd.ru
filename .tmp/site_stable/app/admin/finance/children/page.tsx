import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { createPass } from '../passes/actions'

function csvEscape(v: any) {
  const s = (v==null? '': String(v))
  if (s.includes(';') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g,'""') + '"'
  return s
}

export default async function AdminFinanceChildrenPage({ searchParams }: { searchParams: Promise<{ export?: string }> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const adminId = (session?.user as any)?.id
  if (!session) return <div className="container py-6">Доступ запрещён</div>
  let allowed = ['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)
  if (!allowed && role === 'LOGOPED') {
    const meGuard = await (prisma as any).user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
    const isOwnerGuard = Boolean(meGuard?.branch?.company?.ownerId === adminId)
    const isBranchManagerGuard = Boolean(meGuard?.branch?.managerId === adminId)
    allowed = isOwnerGuard || isBranchManagerGuard
  }
  if (!allowed) return <div className="container py-6">Доступ запрещён</div>

  const me = await (prisma as any).user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
  const isOwner = Boolean(me?.branch?.company?.ownerId === adminId)
  const isBranchManager = Boolean(me?.branch?.managerId === adminId)

  const branchScopeId = (role === 'ACCOUNTANT') ? undefined : (isOwner || isBranchManager) ? me?.branchId : undefined

  const whereChildren: any = { isArchived: false }
  if (role === 'ACCOUNTANT') {
    // бухгалтер — все дети
  } else if (branchScopeId) {
    // руководитель/владелец: дети филиала ИЛИ личные дети руководителя (solo)
    whereChildren.OR = [
      { logoped: { branchId: branchScopeId } },
      { logopedId: adminId },
    ]
  } else {
    // на всякий случай — только личные
    whereChildren.logopedId = adminId
  }

  const children = await (prisma as any).child.findMany({
    where: whereChildren,
    include: {
      logoped: { select: { id: true, name: true, email: true, branchId: true } },
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
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Дети подчинённых</h1>
        <div className="flex gap-2">
          <a href="?export=1" className="btn btn-outline btn-sm">Экспорт CSV</a>
        </div>
      </div>
      <div className="text-sm text-muted">В списке отображаются дети логопедов в вашем контуре: {role==='ACCOUNTANT' ? 'все компании' : 'ваш филиал'}.</div>

      <div className="overflow-x-auto card-table p-3">
        <table className="min-w-full text-sm table-zebra leading-tight">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-4">Ребёнок</th>
              <th className="py-2 pr-4">Логопед</th>
              <th className="py-2 pr-4">Филиал</th>
              <th className="py-2 pr-4 text-right">Цена занятия</th>
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
                  <td className="py-2 pr-4">{c.logoped?.branchId || '—'}</td>
                  <td className="py-2 pr-4 text-right">{c.rateLesson!=null ? `${Number(c.rateLesson).toLocaleString('ru-RU')} ₽` : '—'}</td>
                  <td className="py-2 pr-4">
                    {pass ? (
                      <div className="text-xs">
                        <div>Осталось: <b>{pass.remainingLessons}</b> из {pass.totalLessons}</div>
                        {pass.validUntil && <div>До: {new Date(pass.validUntil).toLocaleDateString('ru-RU')}</div>}
                      </div>
                    ) : (
                      <div className="text-xs text-muted">Нет активного абонемента</div>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    <form action={createPass} className="grid gap-1 sm:grid-cols-5 items-end">
                      <input type="hidden" name="childId" value={c.id} />
                      <input type="hidden" name="logopedId" value={c.logoped?.id || ''} />
                      <div className="sm:col-span-2"><input name="totalLessons" type="number" min={1} placeholder="Занятий" className="input" required /></div>
                      <div className="sm:col-span-2"><input name="totalPrice" type="number" min={0} placeholder="Сумма ₽" className="input" required /></div>
                      <div><input name="validUntil" type="date" className="input" /></div>
                      <div className="sm:col-span-5"><button className="btn btn-secondary btn-sm">Выдать</button></div>
                    </form>
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
