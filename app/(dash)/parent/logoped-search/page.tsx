import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requestActivation, requestConsultation } from '../../../settings/logoped-search/actions'
import VipBadge from '@/components/VipBadge'

function FilterInput({ name, label, defaultValue, type = 'text' }: { name: string; label: string; defaultValue?: any; type?: string }) {
  return (
    <label className="grid gap-1">
      <span className="text-sm text-muted">{label}</span>
      <input name={name} defaultValue={defaultValue} type={type} className="input" />
    </label>
  )
}

export default async function ParentLogopedSearchPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[]>> }) {
  const session = await getServerSession(authOptions)
  if (!session?.user || (session.user as any).role !== 'PARENT') return <div className="container py-6">Доступ запрещён</div>

  const sp = (searchParams ? await searchParams : {}) as Record<string, string | string[]>
  const city = String((sp?.city ?? '') as any)
  const spec = String((sp?.spec ?? '') as any)
  const minExp = Number((sp?.minExp ?? '') as any) || undefined
  const maxPrice = Number((sp?.maxPrice ?? '') as any) || undefined

  const and: any[] = [{ role: 'LOGOPED' }]
  if (city) and.push({ city })
  if (spec) and.push({ specialization: { contains: spec, mode: 'insensitive' } })
  if (typeof minExp === 'number') and.push({ experienceYears: { gte: minExp } })
  if (typeof maxPrice === 'number') and.push({ showPriceToParents: true }, { lessonPrice: { lte: maxPrice } })
  const where: any = { AND: and }

  // Формируем приоритет вручную, чтобы избежать несовместимостей orderBy по boolean
  const superList = await prisma.user.findMany({ where: { AND: [...and, { featuredSuper: true }] }, orderBy: [{ createdAt: 'desc' }], take: 10 })
  const superIds = new Set(superList.map(u => u.id))
  const needLeft1 = Math.max(0, 10 - superList.length)
  const featuredList = await prisma.user.findMany({ where: { AND: [...and, { featured: true }, { id: { notIn: Array.from(superIds) } }] }, orderBy: [{ createdAt: 'desc' }], take: needLeft1 })
  const featuredIds = new Set(featuredList.map(u => u.id))
  const needLeft2 = Math.max(0, 10 - superList.length - featuredList.length)
  const restList = await prisma.user.findMany({ where: { AND: [...and, { id: { notIn: [...superIds, ...featuredIds] as any } }] }, orderBy: [{ createdAt: 'desc' }], take: needLeft2 })
  const logopeds = [...superList, ...featuredList, ...restList]

  return (
    <div className="container py-6 space-y-6">
      <h1 className="text-2xl font-bold">Поиск логопеда</h1>
      {(sp as any)?.consult === 'sent' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Запрос консультации отправлен</div>
      )}
      {(sp as any)?.activation === 'requested' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Запрос на прикрепление отправлен</div>
      )}
      <form method="get" className="grid gap-3 sm:grid-cols-4 items-end">
        <div className="sm:col-span-1">
          <label className="grid gap-1">
            <span className="text-sm text-muted">Город</span>
            <input name="city" className="input" list="city-list" defaultValue={city} placeholder="Начните вводить и выберите" />
            <datalist id="city-list">
              <option value="Москва" />
              <option value="Санкт-Петербург" />
              <option value="Казань" />
              <option value="Новосибирск" />
              <option value="Екатеринбург" />
              <option value="Краснодар" />
            </datalist>
          </label>
        </div>
        <FilterInput name="spec" label="Специализация" defaultValue={spec} />
        <FilterInput name="minExp" label="Стаж от (лет)" defaultValue={minExp} type="number" />
        <FilterInput name="maxPrice" label="Цена до (руб.)" defaultValue={maxPrice} type="number" />
        <div className="sm:col-span-4"><button className="btn">Применить фильтры</button></div>
      </form>

      <div className="grid gap-3">
        {logopeds.length === 0 && <div className="text-sm text-muted">Ничего не найдено. Попробуйте изменить фильтры.</div>}
        {logopeds.map((u: any) => (
          <div key={u.id} className="rounded border p-3" style={{ background: 'var(--card-bg)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold flex items-center gap-2 flex-wrap">
                  {u.name || u.email}
                  {(u as any).featuredSuper || (u as any).featured ? (
                    <VipBadge level={(u as any).featuredSuper ? 'VIP+' : 'VIP'} />
                  ) : null}
                </div>
                <div className="text-sm text-muted">Город: {u.city || '—'}{u.experienceYears ? ` · Стаж: ${u.experienceYears} лет` : ''}</div>
                {u.specialization && <div className="text-sm text-muted">Специализация: {u.specialization}</div>}
                {u.showPriceToParents && typeof u.lessonPrice === 'number' && (
                  <div className="text-sm text-muted">Цена занятия: {u.lessonPrice} ₽</div>
                )}
              </div>
              <form className="flex flex-col sm:flex-row gap-2">
                <input type="hidden" name="logopedId" value={u.id} />
                <input name="note" className="input" placeholder="Комментарий (опц.)" />
                <button formAction={requestConsultation} className="btn btn-outline btn-sm">Запросить консультацию</button>
                <button formAction={requestActivation} className="btn btn-primary btn-sm">Запросить прикрепление</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
