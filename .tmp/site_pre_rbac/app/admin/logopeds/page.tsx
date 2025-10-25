import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { setFeaturedFlags, deleteLogoped, bulkDeleteLogopeds, bulkActivateLogopeds, bulkActivateForever, bulkDeactivateLogopeds } from './actions'
import ConfirmButton from '@/components/ConfirmButton'
import SelectAll from '@/components/SelectAll'
import SelectedCounter from '@/components/SelectedCounter'
import FeatureToggleIcons from '@/components/FeatureToggleIcons'

export default async function AdminLogopedsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[]>> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>
  const sp = (searchParams ? await searchParams : {}) as Record<string, string | string[]>
  const q = String((sp?.q ?? '') as any).trim()
  const city = String((sp?.city ?? '') as any).trim()
  const spec = String((sp?.spec ?? '') as any).trim()
  const minExp = Number((sp?.minExp ?? '') as any) || undefined
  const maxExp = Number((sp?.maxExp ?? '') as any) || undefined
  const minPrice = Number((sp?.minPrice ?? '') as any) || undefined
  const maxPrice = Number((sp?.maxPrice ?? '') as any) || undefined
  const featured = String((sp?.featured ?? '') as any)
  const featuredSuper = String((sp?.featuredSuper ?? '') as any)
  const dateFrom = String((sp?.from ?? '') as any)
  const dateTo = String((sp?.to ?? '') as any)
  const page = Math.max(1, Number((sp?.page ?? '1') as any) || 1)
  const editId = String((sp?.edit ?? '') as any).trim()
  const companyId = String((sp?.companyId ?? '') as any).trim()
  const act = String((sp?.act ?? '') as any).trim() // forever|zero|lte30|gt30
  const pageSize = 20

  const and: any[] = [{ role: 'LOGOPED' }]
  if (q) and.push({ OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] })
  if (city) and.push({ city })
  if (spec) and.push({ specialization: { contains: spec, mode: 'insensitive' } })
  if (typeof minExp === 'number') and.push({ experienceYears: { gte: minExp } })
  if (typeof maxExp === 'number') and.push({ experienceYears: { lte: maxExp } })
  if (typeof minPrice === 'number') and.push({ lessonPrice: { gte: minPrice } })
  if (typeof maxPrice === 'number') and.push({ lessonPrice: { lte: maxPrice } })
  if (featured === '1') and.push({ featured: true })
  if (featuredSuper === '1') and.push({ featuredSuper: true })
  if (dateFrom) and.push({ createdAt: { gte: new Date(dateFrom) as any } })
  if (dateTo) { const d = new Date(dateTo); d.setHours(23,59,59,999); and.push({ createdAt: { lte: d as any } }) }

  if (companyId) and.push({ branch: { companyId } })
  const where: any = { AND: and }
  // Ручная приоритизация: super -> featured -> rest (каждый блок сортируем по createdAt desc)
  const superList = await prisma.user.findMany({ where: { AND: [...and, { featuredSuper: true }] }, orderBy: [{ createdAt: 'desc' }], take: 100 })
  const superIds = new Set(superList.map(u => u.id))
  const needLeft1 = Math.max(0, 100 - superList.length)
  const featuredList = await prisma.user.findMany({ where: { AND: [...and, { featured: true }, { id: { notIn: Array.from(superIds) } }] }, orderBy: [{ createdAt: 'desc' }], take: needLeft1 })
  const featuredIds = new Set(featuredList.map(u => u.id))
  const needLeft2 = Math.max(0, 100 - superList.length - featuredList.length)
  const restList = await prisma.user.findMany({ where: { AND: [...and, { id: { notIn: [...superIds, ...featuredIds] as any } }] }, orderBy: [{ createdAt: 'desc' }], take: needLeft2 })
  let users = [...superList, ...featuredList, ...restList]
  // Фильтр по активации
  if (['forever','zero','lte30','gt30'].includes(act)) {
    const now = new Date()
    users = users.filter((u:any) => {
      const forever = !!u.activatedForever
      const until = u.activatedUntil ? new Date(u.activatedUntil) : null
      const daysLeft = forever ? Infinity : (until ? Math.ceil((until.getTime() - now.getTime()) / 86400000) : 0)
      if (act === 'forever') return forever
      if (act === 'zero') return !forever && (!until || daysLeft <= 0)
      if (act === 'lte30') return !forever && until && daysLeft > 0 && daysLeft <= 31
      if (act === 'gt30') return !forever && until && daysLeft > 31
      return true
    })
  }
  const total = users.length
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const usersPage = users.slice((page - 1) * pageSize, page * pageSize)

  const editing = editId ? await prisma.user.findUnique({ where: { id: editId } }) : null

  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Админ · Логопеды</h1>
      <form method="get" className="grid gap-3 md:grid-cols-6 items-end">
        <label className="grid gap-1">
          <span className="text-sm">Имя/Email</span>
          <input name="q" className="input" defaultValue={q} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Город</span>
          <input name="city" className="input" defaultValue={city} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Специализация</span>
          <input name="spec" className="input" defaultValue={spec} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Стаж от</span>
          <input name="minExp" type="number" className="input" defaultValue={minExp ?? ''} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm">Стаж до</span>
          <input name="maxExp" type="number" className="input" defaultValue={maxExp ?? ''} />
        </label>
        <div className="md:col-span-6 grid grid-cols-2 md:grid-cols-6 gap-3">
          <label className="grid gap-1">
            <span className="text-sm">Цена от</span>
            <input name="minPrice" type="number" className="input" defaultValue={minPrice ?? ''} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm">Цена до</span>
            <input name="maxPrice" type="number" className="input" defaultValue={maxPrice ?? ''} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm">Дата c</span>
            <input name="from" type="date" className="input" defaultValue={dateFrom} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm">Дата до</span>
            <input name="to" type="date" className="input" defaultValue={dateTo} />
          </label>
          <label className="inline-flex items-center gap-2 mt-6" title="Фильтр по супер-приоритету">
            <input type="checkbox" name="featuredSuper" value="1" defaultChecked={featuredSuper==='1'} /> Супер-приоритет
          </label>
          <label className="inline-flex items-center gap-2 mt-6" title="Фильтр по приоритету">
            <input type="checkbox" name="featured" value="1" defaultChecked={featured==='1'} /> Приоритет
          </label>
        </div>
        <div className="md:col-span-6"><button className="btn">Найти</button></div>
      </form>

      <div className="overflow-auto">
        {/* Массовые действия */}
        <form id="bulkLogopeds" className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <SelectAll formId="bulkLogopeds" inputName="ids" />
            <SelectedCounter formId="bulkLogopeds" inputName="ids" label="Выбрано" />
          </div>
          <div className="flex items-center gap-2">
            <input name="months" type="number" min={1} placeholder="мес." className="input w-24" />
            <button className="btn btn-primary btn-sm" formAction={bulkActivateLogopeds}>Активировать на месяцы</button>
            <button className="btn btn-secondary btn-sm" formAction={bulkActivateForever}>Активировать навсегда</button>
            <button className="btn btn-sm bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100" formAction={bulkDeactivateLogopeds}>Деактивировать</button>
            <ConfirmButton className="btn btn-danger btn-sm" message="Удалить выбранных логопедов? Это действие необратимо." title="Удалить выбранных" clickSelector="button[data-submit=bulk-delete]">Удалить выбранных</ConfirmButton>
            <button className="hidden" data-submit="bulk-delete" formAction={bulkDeleteLogopeds} />
          </div>
        </form>
        <table className="table w-full text-sm">
          <thead>
            <tr className="sticky top-0" style={{ background: 'var(--card-bg)' }}>
              <th></th>
              <th>Имя</th>
              <th>Email</th>
              <th>Город</th>
              <th>Спец.</th>
              <th>Стаж</th>
              <th>Цена</th>
              <th title="Супер/Приор">SP</th>
              <th></th>
              <th>Актив</th>
              <th>Действия</th>
              <th>Создан</th>
            </tr>
          </thead>
          <tbody>
            {usersPage.map(u => {
              const forever = (u as any).activatedForever === true
              const until: Date | null = (u as any).activatedUntil ? new Date((u as any).activatedUntil) : null
              const now = new Date()
              const daysLeft = forever ? Infinity : (until ? Math.ceil((until.getTime() - now.getTime()) / 86400000) : 0)
              const inactive = !forever && (!until || daysLeft <= 0)
              const rowClass = forever
                ? 'bg-green-50 text-green-700'
                : (inactive ? 'bg-red-50 text-red-700' : '')
              return (
              <tr key={u.id} className={rowClass}>
                <td>
                  <input type="checkbox" name="ids" value={u.id} form="bulkLogopeds" />
                </td>
                <td>{u.name || '—'}</td>
                <td className="text-muted">{u.email}</td>
                <td>{(u as any).city || '—'}</td>
                <td>{(u as any).specialization || '—'}</td>
                <td>{(u as any).experienceYears ?? '—'}</td>
                <td>{typeof (u as any).lessonPrice === 'number' ? `${(u as any).lessonPrice} ₽` : '—'}</td>
                <td className="whitespace-nowrap">
                  {/* скрытые чекбоксы, управляются иконками ниже */}
                  <input type="checkbox" name="featuredSuper" value="on" defaultChecked={(u as any).featuredSuper} form={`ff-${u.id}`} className="hidden" />
                  <input type="checkbox" name="featured" value="on" defaultChecked={(u as any).featured} form={`ff-${u.id}`} className="hidden" />
                  <form id={`ff-${u.id}`} action={setFeaturedFlags} className="inline-block">
                    <input type="hidden" name="userId" value={u.id} />
                    <FeatureToggleIcons formId={`ff-${u.id}`} defaultSuper={!!(u as any).featuredSuper} defaultPrior={!!(u as any).featured} />
                  </form>
                </td>
                <td></td>
                <td>
                  {forever ? (
                    <span className="text-green-700 font-semibold">б/л</span>
                  ) : inactive ? (
                    <span className="text-red-700 font-semibold">0</span>
                  ) : (daysLeft <= 31 ? (
                    <span className="text-muted">{daysLeft}</span>
                  ) : (
                    <span>{daysLeft}</span>
                  ))}
                </td>
                <td className="space-x-2">
                  <a className="btn btn-secondary btn-sm" href={`?edit=${u.id}`}>Редактировать</a>
                  <a className="btn btn-outline btn-sm" href={`/admin/logopeds/${u.id}`} target="_blank" rel="noopener noreferrer">Просмотреть</a>
                  <form action={deleteLogoped} className="inline-block">
                    <input type="hidden" name="userId" value={u.id} />
                    <ConfirmButton className="btn btn-danger btn-sm" message="Удалить этого логопеда? Это действие необратимо." title="Удалить логопеда">Удалить</ConfirmButton>
                  </form>
                </td>
                <td>{new Date(u.createdAt).toLocaleDateString('ru-RU')}</td>
              </tr>
              )})}
          </tbody>
        </table>
        {/* Навигация */}
        {pages > 1 && (
          <div className="flex items-center justify-between text-sm mt-2">
            <div>Всего: {total}</div>
            <div className="flex gap-2">
              {Array.from({ length: pages }).map((_, i) => {
                const p = i + 1
                const params = new URLSearchParams({ q, city, spec, minExp: String(minExp ?? ''), maxExp: String(maxExp ?? ''), minPrice: String(minPrice ?? ''), maxPrice: String(maxPrice ?? ''), from: dateFrom, to: dateTo, featured, featuredSuper, page: String(p) })
                return <a key={p} className={`btn btn-sm ${p===page ? 'btn-secondary' : ''}`} href={`?${params.toString()}`}>{p}</a>
              })}
            </div>
          </div>
        )}
      </div>

      {/* Слайдовер редактирования логопеда */}
      {editing && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30" />
          <div className="w-full max-w-md shadow-xl p-4 overflow-auto" style={{ background: 'var(--card-bg)' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Редактировать логопеда</h2>
              <a href="?" className="btn btn-outline btn-sm">Закрыть</a>
            </div>
            <form action={setFeaturedFlags} className="hidden"></form>
            <form action={require('./actions').updateLogopedBasic} className="grid gap-3">
              <input type="hidden" name="userId" value={editing.id} />
              <label className="grid gap-1">
                <span className="text-sm">Имя</span>
                <input name="name" className="input" defaultValue={editing.name || ''} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm">Email</span>
                <input name="email" type="email" className="input" defaultValue={editing.email || ''} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm">Город</span>
                <input name="city" className="input" defaultValue={(editing as any).city || ''} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm">Профессия</span>
                <input name="profession" className="input" defaultValue={(editing as any).profession || ''} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm">Специализация</span>
                <input name="specialization" className="input" defaultValue={(editing as any).specialization || ''} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm">О себе</span>
                <textarea name="about" className="textarea" defaultValue={(editing as any).about || ''} />
              </label>
              <label className="grid gap-1">
                <span className="text-sm">Образование</span>
                <textarea name="education" className="textarea" defaultValue={(editing as any).education || ''} />
              </label>
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="hideEducationFromParents" defaultChecked={(editing as any).hideEducationFromParents} /> Скрыть образование от родителей</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="hideAboutFromParents" defaultChecked={(editing as any).hideAboutFromParents} /> Скрыть «О себе» от родителей</label>
              </div>
              <label className="grid gap-1">
                <span className="text-sm">Адрес</span>
                <input name="address" className="input" defaultValue={(editing as any).address || ''} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-sm">Стаж</span>
                  <input name="experienceYears" type="number" className="input" defaultValue={(editing as any).experienceYears ?? ''} />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm">Цена занятия</span>
                  <input name="lessonPrice" type="number" className="input" defaultValue={(editing as any).lessonPrice ?? ''} />
                </label>
              </div>
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="showPriceToParents" defaultChecked={(editing as any).showPriceToParents} /> Показывать цену родителям</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="isOnline" defaultChecked={(editing as any).isOnline} /> Онлайн</label>
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="isOffline" defaultChecked={(editing as any).isOffline} /> Офлайн</label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-sm">Длительность слота (мин)</span>
                  <input name="scheduleSlotMinutes" type="number" className="input" defaultValue={(editing as any).scheduleSlotMinutes ?? ''} />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm">Перерыв между слотами (мин)</span>
                  <input name="scheduleBreakMinutes" type="number" className="input" defaultValue={(editing as any).scheduleBreakMinutes ?? ''} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1">
                  <span className="text-sm">Часовой пояс</span>
                  <input name="timeZone" className="input" defaultValue={(editing as any).timeZone || ''} />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm">Отображение расписания</span>
                  <select name="preferredScheduleView" className="input" defaultValue={(editing as any).preferredScheduleView || ''}>
                    <option value="">—</option>
                    <option value="week">Неделя</option>
                    <option value="month">Месяц</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="notifyByEmail" defaultChecked={(editing as any).notifyByEmail} /> Письма</label>
                <label className="grid gap-1">
                  <span className="text-sm">Валюта</span>
                  <input name="currency" className="input" defaultValue={(editing as any).currency || ''} />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm">Отчётный период</span>
                  <select name="reportPeriod" className="input" defaultValue={(editing as any).reportPeriod || ''}>
                    <option value="">—</option>
                    <option value="week">Неделя</option>
                    <option value="month">Месяц</option>
                    <option value="quarter">Квартал</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="inline-flex items-center gap-2"><input type="checkbox" name="activatedForever" defaultChecked={(editing as any).activatedForever} /> Активирован навсегда</label>
                <label className="grid gap-1">
                  <span className="text-sm">Активен до</span>
                  <input name="activatedUntil" type="date" className="input" defaultValue={(editing as any).activatedUntil ? new Date((editing as any).activatedUntil).toISOString().slice(0,10) : ''} />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn btn-primary">Сохранить</button>
                <a href={`?`} className="btn btn-outline">Отмена</a>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
