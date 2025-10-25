import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
// legacy supervision actions удалены
import { createBranch, assignBranchManager, moveLogoped, inviteLogopedToCompany } from './actions'
import { removeLogopedFromCompany } from './actions'
import { approveMembership, rejectMembership } from '@/app/logoped/organization/membership/actions'
import Link from 'next/link'
import { createOrgConsultationRequest } from './consultations/actions'
import OrgStatsChart from '@/components/OrgStatsChart'
import OrgBranchesDistribution from '@/components/OrgBranchesDistribution'

export default async function SettingsOrganizationPage({ searchParams }: { searchParams?: Promise<{ period?: string; saved?: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return <div className="py-6">Доступ запрещён</div>
  const user = session.user as any
  const role = user.role as string
  if (!['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="py-6">Доступ запрещён</div>
  const selfId = user.id as string

  // загрузка пользователя и компании
  let me = await (prisma as any).user.findUnique({ where: { id: selfId }, include: { branch: { include: { company: { include: { branches: true, owner: true } } } } } })
  // авто-сброс организации, если истёк grace период
  if (me?.orgGraceUntil && new Date(me.orgGraceUntil).getTime() < Date.now()) {
    await (prisma as any).user.update({ where: { id: selfId }, data: { branchId: null, orgGraceUntil: null } })
    me = await (prisma as any).user.findUnique({ where: { id: selfId }, include: { branch: { include: { company: { include: { branches: true } } } } } })
  }
  const companyId = me?.branch?.companyId || null
  const isOwner = Boolean(me?.branch?.company?.ownerId && me.branch.company.ownerId === me.id)
  const isBranchManager = Boolean(me?.branchId && me?.branch?.managerId === me.id)
  // legacy supervision lists удалены
  const branches = me?.branch?.company?.branches || []
  const companyBranches = companyId ? await (prisma as any).branch.findMany({ where: { companyId }, include: { users: true, manager: true } }) : []
  const myBranchUsers = me?.branchId ? await (prisma as any).user.findMany({ where: { branchId: me.branchId, role: 'LOGOPED' }, orderBy: { name: 'asc' } }) : []
  const incomingMemberships = session?.user?.email
    ? await (prisma as any).organizationMembershipRequest.findMany({
        where: { leaderEmail: String(session.user.email).toLowerCase(), status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { requester: true },
      })
    : []
  const companyUsers = companyId ? await (prisma as any).user.findMany({ where: { branch: { companyId } }, include: { branch: true }, orderBy: [{ branchId: 'asc' }, { name: 'asc' }] }) : []
  // Параметры статистики
  const sp = (searchParams ? await searchParams : {}) as { period?: string; saved?: string }
  const allowedPeriods = [7, 30, 90]
  const selectedDays = (() => {
    const p = Number((sp?.period || '').trim())
    return allowedPeriods.includes(p) ? p : 30
  })()
  const fromDate = new Date(Date.now() - selectedDays*24*60*60*1000)
  // Статистика по компании (для владельца)
  const companyStats = isOwner && companyId ? {
    logopeds: await prisma.user.count({ where: { role: 'LOGOPED', branch: { companyId } } }),
    groups: await prisma.group.count({ where: { branch: { companyId } } }),
    lessons: await prisma.lesson.count({ where: { startsAt: { gte: fromDate }, group: { branch: { companyId } } } }),
  } : null
  // Статистика по филиалу (для руководителя филиала)
  const branchStats = isBranchManager && me?.branchId ? {
    logopeds: await prisma.user.count({ where: { role: 'LOGOPED', branchId: me.branchId } }),
    groups: await prisma.group.count({ where: { branchId: me.branchId } }),
    lessons: await prisma.lesson.count({ where: { startsAt: { gte: fromDate }, group: { branchId: me.branchId } } }),
  } : null
  const graceUntil = me?.orgGraceUntil ? new Date(me.orgGraceUntil) : null
  const daysLeft = graceUntil ? Math.ceil((graceUntil.getTime() - Date.now()) / (1000*60*60*24)) : null

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Организация и филиалы</h1>
      {sp?.saved === '1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Изменения сохранены</div>
      )}

      <section className="section">
        {companyId ? (
          <div className="rounded border p-3 mb-4 bg-slate-50">
            <div className="text-sm">Организация: <span className="font-semibold">{me?.branch?.company?.name}</span></div>
            <div className="text-sm">Филиалов: <span className="font-semibold">{branches.length}</span> из <span className="font-semibold">{(me?.branch?.company as any)?.allowedBranches ?? 0}</span></div>
            <div className="text-xs text-muted">Лимит филиалов задаёт бухгалтер. Руководитель может запросить увеличение лимита в разделе заявки.</div>
            <div className="mt-2 text-xs text-muted">
              Лимиты нельзя превышать. Увеличение может быть платным. За подробной информацией обращайтесь к администратору сайта (супер‑администратор):
              <a className="underline ml-1" href="mailto:79889543377@yandex.ru">79889543377@yandex.ru</a>.
              Для запроса увеличения перейдите в раздел <a className="underline ml-1" href="/logoped/organization/expansion">Запрос на расширение лимитов</a>.
            </div>
            {me?.branch?.company?.liquidatedAt && (
              <div className="mt-2 rounded border p-2 bg-amber-50 text-amber-900 text-sm">Организация ликвидирована.
                {daysLeft !== null && daysLeft >= 0 && (
                  <span> Осталось дней для перехода: <b>{daysLeft}</b>.</span>
                )}
              </div>
            )}
            {graceUntil && daysLeft !== null && daysLeft >= 0 && !me?.branch?.company?.liquidatedAt && (
              <div className="mt-2 rounded border p-2 bg-amber-50 text-amber-900 text-sm">Предупреждение: срок на переход в другую организацию истекает через <b>{daysLeft}</b> дн.</div>
            )}
          </div>
        ) : (
          <div className="rounded border p-3 mb-4 bg-amber-50 text-amber-900 text-sm">
            Вы не состоите в организации. <Link className="underline" href="/logoped/organization/request">Отправить заявку на создание</Link> или попросить руководителя пригласить вас.
          </div>
        )}

        {companyId && (
          <div className="rounded border p-3 mb-4">
            <div className="font-medium mb-2">Мой статус</div>
            <div className="flex items-center gap-2 text-sm">
              <span className="badge">Логопед</span>
              {isBranchManager && <span className="badge badge-blue">Руководитель филиала</span>}
              {isOwner && <span className="badge badge-emerald">Руководитель компании</span>}
            </div>
            {isBranchManager && (
              <div className="text-xs text-muted mt-1">Мой филиал: <b>{me?.branch?.name}</b></div>
            )}
            {isOwner && me?.branch?.company?.owner && (
              <div className="text-xs text-muted mt-1">Владелец: {me.branch.company.owner.name || me.branch.company.owner.email}</div>
            )}
          </div>
        )}

        {companyId && (
          <div className="rounded border p-3 mb-4">
            <div className="font-medium mb-2">Сотрудники моей компании (для связи)</div>
            <div className="space-y-3">
              {companyBranches.map((b:any)=> (
                <div key={b.id}>
                  <div className="text-sm font-medium">{b.name}</div>
                  <ul className="space-y-2 mt-1">
                    {companyUsers.filter((u:any)=> u.branchId===b.id).length===0 && (
                      <li className="text-xs text-muted">Нет логопедов</li>
                    )}
                    {companyUsers.filter((u:any)=> u.branchId===b.id).map((u:any)=> (
                      <li key={u.id} className="p-3 text-sm rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span>{u.name || u.email}</span>
                            {b.managerId===u.id && <span className="badge badge-blue">Руководитель филиала</span>}
                            {me?.branch?.company?.ownerId===u.id && <span className="badge badge-emerald">Владелец</span>}
                          </div>
                          <div className="flex items-center gap-2 text-xs">
                            <a className="underline" href={`/chat?with=${u.id}`}>Чат</a>
                            <a className="underline" href={`mailto:${u.email}`}>Почта</a>
                            {(isOwner || (isBranchManager && u.role==='LOGOPED' && u.branchId===me?.branchId)) && (
                              <form action={createOrgConsultationRequest} className="inline-flex items-center gap-1">
                                <input type="hidden" name="targetId" value={u.id} />
                                <input name="topic" className="input input-xs !py-1 !px-2" placeholder="Тема (опц.)" />
                                <button className="btn btn-outline btn-xs" title="Запросить консультацию">Запрос</button>
                              </form>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
        {isOwner && (
          <>
            <h2 className="mb-3 text-lg font-semibold">Управление компанией</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded border p-3">
                <div className="font-medium mb-2">Создать филиал</div>
                <form action={createBranch} className="grid gap-2">
                  <input name="name" className="input" placeholder="Название филиала" required />
                  <input name="address" className="input" placeholder="Адрес (опционально)" />
                  <button className="btn btn-primary btn-sm">Создать</button>
                </form>
                <div className="text-xs text-muted mt-2">Доступно: {branches.length} из {(me?.branch?.company as any)?.allowedBranches ?? 0}</div>
              </div>
              <div className="rounded border p-3">
                <div className="font-medium mb-2">Пригласить логопеда в компанию</div>
                <form action={inviteLogopedToCompany} className="grid gap-2">
                  <input name="email" type="email" className="input" placeholder="email логопеда" required />
                  <button className="btn btn-primary btn-sm">Отправить приглашение</button>
                </form>
              </div>
            </div>

            <div className="rounded border p-3 mt-4">
              <div className="font-medium mb-2">Филиалы компании</div>
              <div className="space-y-3">
                {companyBranches.length === 0 && <div className="text-sm text-muted">Филиалов пока нет</div>}
                {companyBranches.map((b:any)=> (
                  <div key={b.id} className="rounded border p-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">{b.name}</div>
                      <div className="text-xs text-muted">Руководитель: {b.manager?.name || b.manager?.email || 'не назначен'}</div>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <form action={assignBranchManager} className="flex items-center gap-2">
                        <input type="hidden" name="branchId" value={b.id} />
                        <select name="managerId" className="input !py-2 !px-2">
                          {b.users.map((u:any)=> (
                            <option key={u.id} value={u.id}>{u.name || u.email}</option>
                          ))}
                        </select>
                        <button className="btn btn-outline btn-sm">Назначить руководителя</button>
                      </form>
                      <form action={moveLogoped} className="grid gap-2 sm:grid-cols-3">
                        <input type="hidden" name="fromBranchId" value={b.id} />
                        <select name="userId" className="input !py-2 !px-2">
                          {b.users.map((u:any)=> (
                            <option key={u.id} value={u.id}>{u.name || u.email}</option>
                          ))}
                        </select>
                        <select name="toBranchId" className="input !py-2 !px-2">
                          <option value="">— Без филиала —</option>
                          {companyBranches.map((bb:any)=> (
                            <option key={bb.id} value={bb.id}>{bb.name}</option>
                          ))}
                        </select>
                        <button className="btn btn-outline btn-sm">Переместить</button>
                      </form>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded border p-3 mt-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Статистика организации</div>
                <div className="text-sm flex items-center gap-2">
                  <span className="text-muted">Период:</span>
                  <a className={`btn btn-ghost btn-sm ${selectedDays===7?'btn-primary':''}`} href={`/settings/organization?period=7`}>7 дн.</a>
                  <a className={`btn btn-ghost btn-sm ${selectedDays===30?'btn-primary':''}`} href={`/settings/organization?period=30`}>30 дн.</a>
                  <a className={`btn btn-ghost btn-sm ${selectedDays===90?'btn-primary':''}`} href={`/settings/organization?period=90`}>90 дн.</a>
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 mt-3 text-sm">
                <div className="rounded border p-3 bg-slate-50">
                  <div className="text-muted">Логопедов</div>
                  <div className="text-xl font-semibold">{companyStats?.logopeds ?? '-'}</div>
                </div>
                <div className="rounded border p-3 bg-slate-50">
                  <div className="text-muted">Групп</div>
                  <div className="text-xl font-semibold">{companyStats?.groups ?? '-'}</div>
                </div>
                <div className="rounded border p-3 bg-slate-50">
                  <div className="text-muted">Занятий за период</div>
                  <div className="text-xl font-semibold">{companyStats?.lessons ?? '-'}</div>
                </div>
              </div>
              <OrgStatsChart scope="company" days={selectedDays as 7|30|90} />
              <OrgBranchesDistribution days={selectedDays as 7|30|90} />
            </div>
          </>
        )}

        {isBranchManager && (
          <>
            <h2 className="mb-3 text-lg font-semibold">Мой филиал</h2>
            <div className="rounded border p-3 mb-4">
              <div className="text-sm">Филиал: <b>{me?.branch?.name}</b></div>
              <div className="text-sm">Руководитель: <b>{me?.name || me?.email}</b></div>
              {me?.branch?.company?.owner && (
                <div className="text-xs text-muted mt-1">Владелец компании: {me.branch.company.owner.name || me.branch.company.owner.email}</div>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded border p-3">
                <div className="font-medium mb-2">Мои подчинённые (филиал)</div>
                <ul className="space-y-2">
                  {myBranchUsers.filter((u:any)=> u.id !== selfId).length === 0 && <li className="text-sm text-muted">Нет подчинённых</li>}
                  {myBranchUsers.filter((u:any)=> u.id !== selfId).map((u:any)=> (
                    <li key={u.id} className="p-3 text-sm rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                      <div className="flex items-center justify-between">
                        <div>{u.name || u.email}</div>
                        <div className="flex items-center gap-2 text-xs">
                          <a className="underline" href={`/chat?with=${u.id}`}>Чат</a>
                          <a className="underline" href={`mailto:${u.email}`}>Почта</a>
                          <form action={createOrgConsultationRequest} className="inline-flex items-center gap-1">
                            <input type="hidden" name="targetId" value={u.id} />
                            <input name="topic" className="input input-xs !py-1 !px-2" placeholder="Тема (опц.)" />
                            <button className="btn btn-outline btn-xs" title="Запросить консультацию">Запрос</button>
                          </form>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded border p-3">
                <div className="font-medium mb-2">Пригласить логопеда в филиал</div>
                <form action={inviteLogopedToCompany} className="grid gap-2">
                  <input name="email" type="email" className="input" placeholder="email логопеда" required />
                  <button className="btn btn-primary btn-sm">Отправить приглашение</button>
                </form>
              </div>
            </div>
            <div className="rounded border p-3 mt-4">
              <div className="font-medium mb-2">Входящие заявки на вступление</div>
              <div className="space-y-2">
                {incomingMemberships.length === 0 && <div className="text-sm text-muted">Нет заявок</div>}
                {incomingMemberships.map((r:any)=> (
                  <div key={r.id} className="p-3 text-sm rounded-md border shadow-sm flex items-center justify-between" style={{ background: 'var(--card-bg)' }}>
                    <div>
                      <div className="font-medium">{r.requester?.name || r.requester?.email}</div>
                      <div className="text-xs text-muted">{r.requester?.email}</div>
                      <div className="text-muted">{new Date(r.createdAt).toLocaleString('ru-RU')}</div>
                      {r.reason && r.status==='REJECTED' && <div className="text-amber-700">Причина: {r.reason}</div>}
                    </div>
                    <div className="flex items-center gap-2">
                      {r.status==='PENDING' ? (
                        <>
                          <form action={approveMembership}>
                            <input type="hidden" name="reqId" value={r.id} />
                            <button className="btn btn-primary btn-sm">Одобрить</button>
                          </form>
                          <form action={rejectMembership} className="flex items-center gap-1">
                            <input type="hidden" name="reqId" value={r.id} />
                            <input name="reason" className="input !py-1 !px-2" placeholder="Причина" />
                            <button className="btn btn-danger btn-sm">Отклонить</button>
                          </form>
                        </>
                      ) : (
                        <span className={`badge ${r.status==='APPROVED'?'badge-green':'badge-amber'}`}>{r.status==='APPROVED'?'Одобрено':'Отклонено'}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded border p-3 mt-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">Статистика филиала</div>
                <div className="text-sm flex items-center gap-2">
                  <span className="text-muted">Период:</span>
                  <a className={`btn btn-ghost btn-sm ${selectedDays===7?'btn-primary':''}`} href={`/settings/organization?period=7`}>7 дн.</a>
                  <a className={`btn btn-ghost btn-sm ${selectedDays===30?'btn-primary':''}`} href={`/settings/organization?period=30`}>30 дн.</a>
                  <a className={`btn btn-ghost btn-sm ${selectedDays===90?'btn-primary':''}`} href={`/settings/organization?period=90`}>90 дн.</a>
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-3 mt-3 text-sm">
                <div className="rounded border p-3 bg-slate-50">
                  <div className="text-muted">Логопедов</div>
                  <div className="text-xl font-semibold">{branchStats?.logopeds ?? '-'}</div>
                </div>
                <div className="rounded border p-3 bg-slate-50">
                  <div className="text-muted">Групп</div>
                  <div className="text-xl font-semibold">{branchStats?.groups ?? '-'}</div>
                </div>
                <div className="rounded border p-3 bg-slate-50">
                  <div className="text-muted">Занятий за период</div>
                  <div className="text-xl font-semibold">{branchStats?.lessons ?? '-'}</div>
                </div>
              </div>
              <OrgStatsChart scope="branch" days={selectedDays as 7|30|90} />
            </div>
          </>
        )}

      </section>
    </div>
  )
}
