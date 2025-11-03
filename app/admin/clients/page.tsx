import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { bulkDeleteParents, deleteParent, restoreParent, updateParentAdmin, updateChildLogoped, requestTransferByEmail, deleteChild as archiveChild, restoreChild } from './actions'
import VipBadge from '@/components/VipBadge'
import ConfirmButton from '@/components/ConfirmButton'
import SelectAll from '@/components/SelectAll'
import AdminBroadcast from '@/components/AdminBroadcast'

export default async function AdminClientsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[]>> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>
  const userId = (session.user as any).id as string
  const sp = (searchParams ? await searchParams : {}) as Record<string, string | string[]>
  const q = String((sp?.q ?? '') as any).trim()
  const city = String((sp?.city ?? '') as any).trim()
  const logopedQ = String((sp?.logoped ?? '') as any).trim()
  const dateFrom = String((sp?.from ?? '') as any)
  const dateTo = String((sp?.to ?? '') as any)
  const minKids = Number((sp?.minKids ?? '') as any) || undefined
  const maxKids = Number((sp?.maxKids ?? '') as any) || undefined
  const showArchived = String((sp?.arch ?? '') as any) === '1'
  const pPage = Math.max(1, Number((sp?.pPage ?? '1') as any) || 1)
  const cPage = Math.max(1, Number((sp?.cPage ?? '1') as any) || 1)
  const pageSize = 20
  const editParentId = String((sp?.editParent ?? '') as any).trim()
  const phoneError = String((sp?.phoneError ?? '') as any) === '1'

  // where по User
  const andUser: any[] = []
  if (q) andUser.push({ OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] })
  if (city) andUser.push({ city })
  if (dateFrom) andUser.push({ createdAt: { gte: new Date(dateFrom) as any } })
  if (dateTo) { const d = new Date(dateTo); d.setHours(23,59,59,999); andUser.push({ createdAt: { lte: d as any } }) }

  // Загружаем родителей с пользователем и детьми
  const parents = await prisma.parent.findMany({
    where: {
      ...(andUser.length ? { user: { AND: andUser } } : {}),
      ...(showArchived ? {} : { isArchived: false }),
    },
    include: { user: true, _count: { select: { children: true } }, children: { include: { logoped: { select: { id: true, name: true, email: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  const editingParent = editParentId ? await prisma.parent.findUnique({ where: { id: editParentId }, include: { user: true, children: { include: { logoped: true } } } }) : null
  // Определяем компанию бухгалтера и ограничиваем список логопедов своей компанией
  const me = await prisma.user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } })
  const companyId = (me as any)?.branch?.companyId as string | undefined
  const allLogopeds = editParentId
    ? await prisma.user.findMany({
        where: { role: 'LOGOPED', ...(companyId ? { branch: { companyId } } : {}) },
        select: { id: true, name: true, email: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      })
    : []

  // Фильтрация по количеству детей на стороне приложения (при необходимости можно переписать через агрегации)
  const filtered = parents.filter(p => {
    const c = (p as any)._count.children as number
    if (typeof minKids === 'number' && c < minKids) return false
    if (typeof maxKids === 'number' && c > maxKids) return false
    if (logopedQ) {
      const hasByLogoped = (p as any).children?.some((ch: any) => {
        const lp = ch.logoped
        if (!lp) return false
        return (lp.name && lp.name.toLowerCase().includes(logopedQ.toLowerCase())) || (lp.email && lp.email.toLowerCase().includes(logopedQ.toLowerCase()))
      })
      if (!hasByLogoped) return false
    }
    return true
  })

  // Пагинация родителей (после фильтрации по количеству детей)
  const totalParents = filtered.length
  const pPages = Math.max(1, Math.ceil(totalParents / pageSize))
  const parentsPage = filtered.slice((pPage - 1) * pageSize, pPage * pageSize)

  // Загружаем детей (для второй таблицы) — считаем total и применяем skip/take
  const whereChildren: any = showArchived ? {} : { isArchived: false }
  const totalChildren = await (prisma as any).child.count({ where: whereChildren })
  const cPages = Math.max(1, Math.ceil(totalChildren / pageSize))
  const children = await (prisma as any).child.findMany({
    where: whereChildren,
    include: { parent: { include: { user: true } }, logoped: { select: { id: true, name: true, email: true } } },
    orderBy: { id: 'desc' },
    skip: (cPage - 1) * pageSize,
    take: pageSize,
  })

  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Админ · Клиенты</h1>
      <form method="get" className="grid gap-3 md:grid-cols-8 items-end">
        <label className="grid gap-1">
          <span className="text-sm">Имя/Email</span>
          <input name="q" className="input" defaultValue={q} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Логопед (имя/email)</span>
          <input name="logoped" className="input" defaultValue={logopedQ} placeholder="Фильтр по логопеду детей" />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Город</span>
          <input name="city" className="input" defaultValue={city} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Дата c</span>
          <input name="from" type="date" className="input" defaultValue={dateFrom} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Дата до</span>
          <input name="to" type="date" className="input" defaultValue={dateTo} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Детей от</span>
          <input name="minKids" type="number" className="input" defaultValue={minKids ?? ''} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Детей до</span>
          <input name="maxKids" type="number" className="input" defaultValue={maxKids ?? ''} />
        </label>
        <label className="inline-flex items-center gap-2 mt-6">
          <input type="checkbox" name="arch" value="1" defaultChecked={showArchived} /> Показывать архив
        </label>
        <div className="md:col-span-8"><button className="btn">Найти</button></div>
      </form>

      {['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role) && (
        <div className="mt-2">
          <AdminBroadcast />
        </div>
      )}

      <div className="overflow-auto">
        {/* Родители */}
        <form id="bulkParents" action={bulkDeleteParents} className="mb-2 flex items-center justify-between gap-2">
          <SelectAll formId="bulkParents" inputName="ids" />
          <ConfirmButton className="btn btn-danger btn-sm" message="Удалить выбранных родителей (архивировать вместе с детьми)?">Удалить выбранных родителей</ConfirmButton>
        </form>
        <table className="table w-full text-sm">
          <thead>
            <tr className="sticky top-0" style={{ background: 'var(--card-bg)' }}>
              <th></th>
              <th>Имя</th>
              <th>Email</th>
              <th>Город</th>
              <th>Детей</th>
              <th>Дети / Логопед</th>
              <th>Действия</th>
              <th>Создан</th>
            </tr>
          </thead>
          <tbody>
            {parentsPage.map(p => (
              <tr key={p.id} style={{ background: 'var(--card-bg)' }}>
                <td>
                  <input type="checkbox" name="ids" value={p.id} form="bulkParents" />
                </td>
                <td>{p.user?.name || '—'}</td>
                <td className="text-muted">{p.user?.email ? (<a className="link" href={`mailto:${p.user.email}`}>{p.user.email}</a>) : '—'}</td>
                <td>{(p.user as any)?.city || '—'}</td>
                <td>{(p as any)._count.children}</td>
                <td>
                  <div className="space-y-1">
                    {(p as any).children?.length === 0 && <div className="text-xs text-muted">Нет детей</div>}
                    {(p as any).children?.slice().sort((a:any,b:any)=>{
                      const as = (a.logoped?.featuredSuper?2:(a.logoped?.featured?1:0))
                      const bs = (b.logoped?.featuredSuper?2:(b.logoped?.featured?1:0))
                      return bs - as
                    }).map((ch: any) => (
                      <div key={ch.id} className="text-xs">
                        <a className="font-medium link" href={`/logoped/child/${ch.id}`} target="_blank">{ch.lastName} {ch.firstName}</a>
                        <span className="ml-2 text-muted">Логопед: {ch.logoped ? (
                          <>
                            {ch.logoped.name ? (
                              <span className="inline-flex items-center gap-1">{ch.logoped.name}{(ch.logoped as any).featuredSuper || (ch.logoped as any).featured ? (
                                <VipBadge level={(ch.logoped as any).featuredSuper ? 'VIP+' : 'VIP'} />
                              ) : null} · </span>
                            ) : null}
                            <a className="link" href={`mailto:${ch.logoped.email}`}>{ch.logoped.email}</a>
                          </>
                        ) : '—'}</span>
                      </div>
                    ))}
                  </div>
                </td>
                <td className="space-x-2">
                  <a className="btn btn-secondary btn-sm" href={`?editParent=${p.id}`}>Редактировать</a>
                  <a className="btn btn-outline btn-sm" href={`/admin/clients/parent/${p.id}`} target="_blank" rel="noopener noreferrer">Просмотреть</a>
                  {!p.isArchived ? (
                    <form action={deleteParent} className="inline-block">
                      <input type="hidden" name="parentId" value={p.id} />
                      <ConfirmButton className="btn btn-danger btn-sm" message="Архивировать родителя и всех его детей?">Удалить</ConfirmButton>
                    </form>
                  ) : (
                    <form action={restoreParent} className="inline-block">
                      <input type="hidden" name="parentId" value={p.id} />
                      <button className="btn btn-secondary btn-sm">Восстановить</button>
                    </form>
                  )}
                </td>
                <td>{new Date(p.createdAt).toLocaleDateString('ru-RU')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {/* Навигация по родителям */}
        {pPages > 1 && (
          <div className="flex items-center justify-between text-sm mt-2">
            <div>Всего: {totalParents}</div>
            <div className="flex gap-2">
              {Array.from({ length: pPages }).map((_, i) => {
                const page = i + 1
                const qp = new URLSearchParams({ q, city, from: dateFrom, to: dateTo, minKids: String(minKids ?? ''), maxKids: String(maxKids ?? ''), arch: showArchived ? '1' : '', pPage: String(page), cPage: String(cPage) })
                return <a key={page} className={`btn btn-sm ${page===pPage ? 'btn-secondary' : ''}`} href={`?${qp.toString()}`}>{page}</a>
              })}
            </div>
          </div>
        )}
      </div>

      {/* Слайдовер редактирования родителя */}
      {phoneError && (
        <div className="rounded border p-3 bg-amber-50 text-amber-900 text-sm">Телефон должен быть в формате +7XXXXXXXXXX. Проверьте ввод и сохраните снова.</div>
      )}
      {editingParent && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" />
          <div className="w-full max-w-md shadow-xl p-4 overflow-auto" style={{ background: 'var(--card-bg)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Редактировать клиента</h2>
              <a href="?" className="btn btn-outline btn-sm">Закрыть</a>
            </div>
            <form action={updateParentAdmin} className="grid gap-3">
              <input type="hidden" name="parentId" value={editingParent.id} />
              <label className="grid gap-1">
                <span className="text-sm">Имя (профиль пользователя)</span>
                <input name="name" className="input" defaultValue={editingParent.user?.name || ''} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm">Email (профиль пользователя)</span>
                <input name="email" type="email" className="input" defaultValue={editingParent.user?.email || ''} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm">Город (профиль пользователя)</span>
                <input name="city" className="input" defaultValue={(editingParent.user as any)?.city || ''} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm">Адрес (профиль пользователя)</span>
                <input name="address" className="input" defaultValue={(editingParent.user as any)?.address || ''} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm">ФИО (карточка родителя)</span>
                <input name="fullName" className="input" defaultValue={(editingParent as any).fullName || ''} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm">Телефон (карточка родителя)</span>
                <input name="phone" className="input" defaultValue={(editingParent as any).phone || ''} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm">Информация (карточка родителя)</span>
                <textarea name="info" className="textarea" defaultValue={(editingParent as any).info || ''} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="isArchived" defaultChecked={(editingParent as any).isArchived} /> Архивировать</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="notifyByEmail" defaultChecked={(editingParent.user as any)?.notifyByEmail} /> Получать письма</label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-sm">Часовой пояс</span>
                  <input name="timeZone" className="input" defaultValue={(editingParent.user as any)?.timeZone || ''} />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-primary">Сохранить</button>
                <a href="?" className="btn btn-outline">Отмена</a>
              </div>
            </form>
            {/* Управление логопедом каждого ребёнка (вынесено из формы, чтобы избежать вложенных <form>) */}
            <div className="rounded border p-3 mt-4">
              <div className="font-semibold mb-2">Назначение логопеда детям</div>
              <div className="mb-2 rounded border p-2 bg-amber-50 text-amber-900 text-xs">
                Если при назначении логопеда возникает ограничение по лимитам организации, откройте раздел
                {' '}<a className="underline" href="/settings/billing?quota=logopeds" target="_blank" rel="noreferrer">Настройки → Подписка</a>
                {' '}для увеличения лимитов.
              </div>
              {(editingParent.children || []).length === 0 && (
                <div className="text-sm text-muted">У этого родителя нет детей</div>
              )}
              {(editingParent.children || []).map((ch:any) => (
                <div key={ch.id} className="grid gap-2 md:grid-cols-3 items-end mb-3 p-2 rounded border">
                    <div className="text-sm">
                    <div className="font-medium">{ch.lastName} {ch.firstName}</div>
                    <div className="text-muted">Текущий: {ch.logoped ? (ch.logoped.name || ch.logoped.email) : '—'}</div>
                  </div>
                  <form action={updateChildLogoped} className="grid gap-2 md:grid-cols-2 items-end">
                    <input type="hidden" name="childId" value={ch.id} />
                    <label className="grid gap-1">
                      <span className="text-sm text-muted">Логопед (внутри компании)</span>
                      <select name="logopedId" className="input" defaultValue={ch.logoped?.id || ''}>
                        <option value="">— не назначен —</option>
                        {allLogopeds.map((lp:any) => (
                          <option key={lp.id} value={lp.id}>{lp.name || lp.email}</option>
                        ))}
                      </select>
                    </label>
                    <button className="btn btn-secondary">Сохранить</button>
                  </form>
                  <div className="grid gap-2 md:grid-cols-2 items-end">
                    <form action={requestTransferByEmail} className="grid gap-1">
                      <input type="hidden" name="childId" value={ch.id} />
                      <label className="grid gap-1">
                        <span className="text-sm">Передать по email (вне организации)</span>
                        <input name="email" type="email" className="input" placeholder="email логопеда" />
                      </label>
                      <button className="btn btn-outline">Отправить запрос</button>
                    </form>
                    <div className="flex items-end gap-2">
                      {!ch.isArchived ? (
                        <form action={archiveChild}>
                          <input type="hidden" name="childId" value={ch.id} />
                          <button className="btn btn-danger">В архив</button>
                        </form>
                      ) : (
                        <form action={restoreChild}>
                          <input type="hidden" name="childId" value={ch.id} />
                          <button className="btn btn-secondary">Восстановить</button>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* Таблица детей убрана, т.к. дети отображаются в строке родителя для лучшей связности данных */}
    </div>
  )
}
