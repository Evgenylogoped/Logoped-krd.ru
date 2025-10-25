import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { liquidateCompany, updateCompanyLimits, approveExpansionRequest, rejectExpansionRequest, deleteCompanyNow } from './actions'

export default async function AdminOrganizationsPage({ searchParams }: { searchParams?: Promise<Record<string, string>> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>
  const sp = (await searchParams) as Record<string, string>
  const q = String(sp?.q || '').trim()
  const city = String(sp?.city || '').trim()
  // PENDING | APPROVED | REJECTED | ''
  const expFrom = String(sp?.expFrom || '')
  const expTo = String(sp?.expTo || '')
  const expPage = Math.max(1, Number(String(sp?.expPage || '1')) || 1)
  const expStatus = String(sp?.expStatus || '')
  const pageSize = 20
  const and: any[] = []
  if (q) and.push({ name: { contains: q, mode: 'insensitive' } })
  const where: any = and.length ? { AND: and } : {}
  // Базовая загрузка компаний (без include, чтобы избежать несовпадений схемы)
  const companies = await (prisma as any).company.findMany({ where, orderBy: { name: 'asc' }, take: 200 })
  // Ветки компаний отдельным запросом
  const companyIds = companies.map((c: any) => c.id)
  const branchesAll = companyIds.length ? await (prisma as any).branch.findMany({ where: { companyId: { in: companyIds } }, select: { id: true, name: true, companyId: true } }) : []
  const branchesByCompany: Record<string, Array<{ id: string; name: string; companyId: string }>> = {}
  for (const b of branchesAll) {
    if (!branchesByCompany[b.companyId]) branchesByCompany[b.companyId] = []
    branchesByCompany[b.companyId].push(b)
  }
  // предварительно считаем количество логопедов по компаниям
  const logopedUsers = companyIds.length ? await (prisma as any).user.findMany({ where: { role: 'LOGOPED', branch: { companyId: { in: companyIds } } }, select: { id: true, branch: { select: { companyId: true } } } }) : []
  const logopedsByCompany: Record<string, number> = {}
  for (const u of logopedUsers) {
    const cid = u?.branch?.companyId as string | undefined
    if (!cid) continue
    logopedsByCompany[cid] = (logopedsByCompany[cid] || 0) + 1
  }
  // сводка активации логопедов по компаниям
  const logopedActivation = companyIds.length ? await (prisma as any).user.findMany({
    where: { role: 'LOGOPED', branch: { companyId: { in: companyIds } } },
    select: { id: true, activatedForever: true, activatedUntil: true, branch: { select: { companyId: true } } },
  }) : []
  const activationByCompany: Record<string, { forever: number; zero: number; lte30: number; gt30: number }> = {}
  const now = new Date()
  for (const u of logopedActivation) {
    const cid = u?.branch?.companyId as string | undefined
    if (!cid) continue
    const entry = (activationByCompany[cid] ||= { forever: 0, zero: 0, lte30: 0, gt30: 0 })
    const forever = !!u.activatedForever
    if (forever) { entry.forever++; continue }
    const until = u.activatedUntil ? new Date(u.activatedUntil as any) : null
    const daysLeft = until ? Math.ceil(((until as any).getTime() - now.getTime()) / 86400000) : 0
    if (!until || daysLeft <= 0) entry.zero++
    else if (daysLeft <= 31) entry.lte30++
    else entry.gt30++
  }
  // владельцы компаний
  const ownerIds = Array.from(new Set(companies.map((c:any)=> c.ownerId).filter(Boolean)))
  const owners = ownerIds.length ? await (prisma as any).user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } }) : []
  const ownerById: Record<string, { id: string; name: string|null; email: string } > = {}
  for (const o of owners) ownerById[o.id] = o
  // заявки на расширение по компаниям (для карточек компаний)
  const expansionByCompany: Record<string, any[]> = {}
  if (companyIds.length) {
    const allExp = await (prisma as any).organizationExpansionRequest.findMany({ where: { companyId: { in: companyIds } }, include: { requester: true }, orderBy: { createdAt: 'desc' } })
    for (const r of allExp) {
      const cid = r.companyId as string
      if (!expansionByCompany[cid]) expansionByCompany[cid] = []
      expansionByCompany[cid].push(r)
    }
  }
  // сводка активных заявок
  const pendingExpansions = await (prisma as any).organizationExpansionRequest.findMany({ where: { status: (expStatus || 'PENDING') as any, ...(expFrom ? { createdAt: { gte: new Date(expFrom) } } : {}), ...(expTo ? { createdAt: { lte: new Date(expTo + 'T23:59:59') } } : {}) }, include: { requester: true, company: true }, orderBy: { createdAt: 'desc' }, take: 200 })
  // история заявок (пагинация)
  const historyWhere: any = { ...(expStatus ? { status: expStatus } : {}), ...(expFrom ? { createdAt: { gte: new Date(expFrom) } } : {}), ...(expTo ? { createdAt: { lte: new Date(expTo + 'T23:59:59') } } : {}) }
  const totalHistory = await (prisma as any).organizationExpansionRequest.count({ where: historyWhere })
  const history = await (prisma as any).organizationExpansionRequest.findMany({ where: historyWhere, include: { requester: true, company: true }, orderBy: { createdAt: 'desc' }, skip: (expPage - 1) * pageSize, take: pageSize })
  const pageCount = Math.max(1, Math.ceil(totalHistory / pageSize))
  // рассчет загрузки логопедов по компаниям (по предрасчитанному словарю)
  const companyStats = companies.map((c: any) => {
    const logopedsCount = logopedsByCompany[c.id] || 0
    const total = Number(c.allowedLogopeds || 0)
    const ratio = total ? (logopedsCount / total) : 0
    return { c, logopedsCount, total, ratio }
  })
  const overLimit = companyStats.filter((s: any) => s.total > 0 && s.logopedsCount > s.total)
  const nearLimit = companyStats.filter((s: any) => s.total > 0 && s.logopedsCount <= s.total && s.ratio >= 0.9)

  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Организации</h1>
      {(sp as any)?.ok === 'liquidated' && (
        <div className="rounded border p-3 bg-amber-50 text-amber-800 text-sm">Организация ликвидирована</div>
      )}
      {(sp as any)?.ok === 'deleted' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Организация удалена</div>
      )}
      <form method="get" className="grid md:grid-cols-5 items-end gap-2">
        <label className="grid gap-1 flex-1">
          <span className="text-sm">Поиск по названию</span>
          <input name="q" className="input" defaultValue={q} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Статус заявок (расшир.)</span>
          <select name="expStatus" className="input !py-2 !px-2" defaultValue={expStatus}>
            <option value="">—</option>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-sm">От (дата)</span>
          <input type="date" name="expFrom" className="input" defaultValue={expFrom} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">До (дата)</span>
          <input type="date" name="expTo" className="input" defaultValue={expTo} />
        </label>
        <button className="btn">Применить</button>
      </form>

      {/* Сводка активных заявок на расширение по всем компаниям */}
      <div className="rounded border p-3">
        <div className="text-lg font-semibold mb-2">Заявки на расширение (сводка)</div>
        <div className="space-y-2">
          {pendingExpansions.length === 0 && (
            <div className="text-sm text-muted">Нет заявок по выбранным фильтрам</div>
          )}
          {pendingExpansions.map((r:any)=> (
            <div key={r.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-sm">
              <div>
                <div className="font-medium">{r.company?.name || '—'}</div>
                <div className="text-xs text-muted">{new Date(r.createdAt).toLocaleString('ru-RU')} · Инициатор: {r.requester?.name || r.requester?.email}</div>
                <div className="text-xs text-muted">Тип: {r.type} · Запрошено: филиалы={r.requestedBranches ?? '—'}, логопеды={r.requestedLogopeds ?? '—'}</div>
              </div>

      {/* Компании, требующие внимания по лимиту логопедов */}
      <div className="rounded border p-3">
        <div className="text-lg font-semibold mb-2">Внимание: лимиты логопедов</div>
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <div className="text-sm font-medium mb-1">Превышен лимит</div>
            <div className="space-y-1">
              {overLimit.length === 0 && <div className="text-sm text-muted">Нет</div>}
              {overLimit.map(({ c, logopedsCount, total }: { c: any; logopedsCount: number; total: number }) => (
                <div key={c.id} className="text-sm flex items-center justify-between">
                  <div className="truncate pr-2">{c.name}</div>
                  <div className="whitespace-nowrap"><b>{logopedsCount}</b> / {total}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-sm font-medium mb-1">Почти лимит (≥90%)</div>
            <div className="space-y-1">
              {nearLimit.length === 0 && <div className="text-sm text-muted">Нет</div>}
              {nearLimit.map(({ c, logopedsCount, total }: { c: any; logopedsCount: number; total: number }) => (
                <div key={c.id} className="text-sm flex items-center justify-between">
                  <div className="truncate pr-2">{c.name}</div>
                  <div className="whitespace-nowrap"><b>{logopedsCount}</b> / {total}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
              {r.status==='PENDING' && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <form action={approveExpansionRequest}>
                    <input type="hidden" name="reqId" value={r.id} />
                    <button className="btn btn-secondary btn-sm">Одобрить</button>
                  </form>
                  <form action={rejectExpansionRequest} className="flex items-center gap-2">
                    <input type="hidden" name="reqId" value={r.id} />
                    <input name="reason" className="input" placeholder="Причина" required />
                    <button className="btn btn-danger btn-sm">Отклонить</button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {companies.map((c:any) => {
          const logopedsCount = logopedsByCompany[c.id] || 0
          return (
            <div key={c.id} className="rounded border p-2 sm:p-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="font-semibold text-base sm:text-lg leading-tight truncate">{c.name}</div>
                  <div className="text-[11px] text-muted">Владелец: {c.ownerId ? (ownerById[c.ownerId]?.name || ownerById[c.ownerId]?.email) : '—'}</div>
                  {c.liquidatedAt && <div className="text-[11px] text-red-600">Ликвидирована: {new Date(c.liquidatedAt).toLocaleString('ru-RU')}</div>}
                </div>
                <div className="text-xs sm:text-sm space-y-1">
                  <div>
                    Филиалы: <span className="font-semibold">{(branchesByCompany[c.id]?.length) || 0}</span> / {c.allowedBranches}
                    {(() => {
                      const used = Number((branchesByCompany[c.id]?.length) || 0)
                      const total = Number(c.allowedBranches || 0)
                      if (!total) return null
                      const ratio = used / total
                      let cls = 'badge'
                      let label = ''
                      if (used > total) { cls += ' badge-amber'; label = 'Превышен лимит'; }
                      else if (ratio >= 0.9) { cls += ' badge-amber'; label = 'Почти лимит'; }
                      else if (ratio >= 0.6) { cls += ' badge-green'; label = 'Норма'; }
                      else { cls += ' badge'; label = 'Свободно'; }
                      return <span className={`ml-2 ${cls}`}>{label}</span>
                    })()}
                  </div>
                  <div>
                    Логопеды: <span className="font-semibold">{logopedsCount}</span> / {c.allowedLogopeds}
                    {(() => {
                      const used = Number(logopedsCount || 0)
                      const total = Number(c.allowedLogopeds || 0)
                      if (!total) return null
                      const ratio = used / total
                      let cls = 'badge'
                      let label = ''
                      if (used > total) { cls += ' badge-amber'; label = 'Превышен лимит'; }
                      else if (ratio >= 0.9) { cls += ' badge-amber'; label = 'Почти лимит'; }
                      else if (ratio >= 0.6) { cls += ' badge-green'; label = 'Норма'; }
                      else { cls += ' badge'; label = 'Свободно'; }
                      return <span className={`ml-2 ${cls}`}>{label}</span>
                    })()}
                    {logopedsCount === 0 && (
                      <span className="ml-2 badge badge-amber" title="Организация будет удалена сразу при ликвидации или при выходе последнего логопеда">0 логопедов — удалится сразу</span>
                    )}
                  </div>
                  {/* Компактная сводка по активации логопедов */}
                  {(() => {
                    const s = activationByCompany[c.id] || { forever: 0, zero: 0, lte30: 0, gt30: 0 }
                    return (
                      <div className="flex flex-wrap gap-1 mt-1">
                        <a className="px-2 py-0.5 rounded text-[11px] bg-green-50 text-green-700" href={`/admin/logopeds?companyId=${c.id}&act=forever`}>б/л: {s.forever}</a>
                        <a className="px-2 py-0.5 rounded text-[11px]" href={`/admin/logopeds?companyId=${c.id}&act=gt30`}>&gt;30д: {s.gt30}</a>
                        <a className="px-2 py-0.5 rounded text-[11px] bg-gray-100 text-muted" href={`/admin/logopeds?companyId=${c.id}&act=lte30`}>≤30д: {s.lte30}</a>
                        <a className="px-2 py-0.5 rounded text-[11px] bg-red-50 text-red-700" href={`/admin/logopeds?companyId=${c.id}&act=zero`}>0: {s.zero}</a>
                      </div>
                    )
                  })()}
                </div>
              </div>

              <div className="mt-2 grid gap-2 sm:grid-cols-3 items-end text-xs sm:text-sm">
                <form action={updateCompanyLimits} className="flex items-end gap-2">
                  <input type="hidden" name="companyId" value={c.id} />
                  <label className="grid gap-1">
                    <span className="text-[11px]">Лимит филиалов</span>
                    <input name="allowedBranches" type="number" min={1} className="input w-28" defaultValue={c.allowedBranches} />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-[11px]">Лимит логопедов</span>
                    <input name="allowedLogopeds" type="number" min={1} className="input w-28" defaultValue={c.allowedLogopeds} />
                  </label>
                  <button className="btn btn-sm">Сохранить</button>
                </form>
                <form action={liquidateCompany} className="flex items-end gap-2">
                  <input type="hidden" name="companyId" value={c.id} />
                  <button className="btn btn-danger btn-sm" disabled={!!c.liquidatedAt}>Ликвидировать</button>
                </form>
                {logopedsCount === 0 && (
                  <form action={deleteCompanyNow} className="flex items-end gap-2">
                    <input type="hidden" name="companyId" value={c.id} />
                    <button className="btn btn-danger btn-sm">Удалить сейчас</button>
                  </form>
                )}
              </div>

              <div className="mt-2">
                <div className="text-[11px] text-muted">Филиалы:</div>
                <ul className="list-disc ml-5 text-sm">
                  {(branchesByCompany[c.id] || []).map((b:any)=> (
                    <li key={b.id}>{b.name}</li>
                  ))}
                </ul>
              </div>

              {Array.isArray(expansionByCompany[c.id]) && expansionByCompany[c.id].length > 0 && (
                <div className="mt-4">
                  <div className="text-sm font-semibold mb-2">Заявки на расширение лимитов</div>
                  <div className="space-y-2">
                    {expansionByCompany[c.id].map((r:any)=> (
                      <div key={r.id} className="rounded border p-2 text-sm flex flex-col gap-2">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                          <div>
                            <div>Тип: <b>{r.type}</b> · Статус: <b>{r.status}</b></div>
                            <div className="text-xs text-muted">Инициатор: {r.requester?.name || r.requester?.email} · {new Date(r.createdAt).toLocaleString('ru-RU')}</div>
                            <div className="text-xs text-muted">
                              Запрошено: филиалы={r.requestedBranches ?? '—'}, логопеды={r.requestedLogopeds ?? '—'}
                            </div>
                            {r.status==='REJECTED' && r.reason && (
                              <div className="text-xs text-amber-700">Причина отказа: {r.reason}</div>
                            )}
                          </div>
                          {r.status==='PENDING' && (
                            <div className="flex flex-col sm:flex-row gap-2">
                              <form action={approveExpansionRequest}>
                                <input type="hidden" name="reqId" value={r.id} />
                                <button className="btn btn-secondary btn-sm">Одобрить</button>
                              </form>
                              <form action={rejectExpansionRequest} className="flex items-center gap-2">
                                <input type="hidden" name="reqId" value={r.id} />
                                <input name="reason" className="input" placeholder="Причина" required />
                                <button className="btn btn-danger btn-sm">Отклонить</button>
                              </form>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
