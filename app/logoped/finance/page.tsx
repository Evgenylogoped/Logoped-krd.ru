import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { getTherapistSummary } from '@/services/finance'

export default async function LogopedFinancePage({ searchParams }: { searchParams?: Promise<{ period?: string; sent?: string; pending?: string; month?: string; page?: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const userId = (session?.user as any)?.id
  const branchId = (session?.user as any)?.branchId as string | null | undefined
  if (!session || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>

  // Период: ограничиваем текущим календарным годом
  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1)
  // Фиксированный период для личной статистики: текущий календарный год
  const period: string = 'year'
  const periodStart = (() => {
    const d = new Date(now)
    switch (period) {
      case 'day': return new Date(now.getFullYear(), now.getMonth(), now.getDate())
      case 'week': {
        const wd = (now.getDay()+6)%7; const start = new Date(now); start.setDate(now.getDate()-wd); start.setHours(0,0,0,0); return start
      }
      case 'month': return new Date(now.getFullYear(), now.getMonth(), 1)
      case 'half': return new Date(now.getFullYear(), now.getMonth()<6?0:6, 1)
      case 'year': return yearStart
      default: return new Date(now.getFullYear(), now.getMonth(), 1)
    }
  })()

  // Определим статус руководителя и факт принадлежности к организации
  const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: userId }, select: { id: true } })
  const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: userId }, select: { id: true } })
  const isLeader = Boolean(ownedCompany) || Boolean(managesAny)
  const inOrg = Boolean(branchId)
  const headingText = isLeader ? 'Личная статистика руководителя' : (!inOrg ? 'Личная статистика без организации' : 'Личная статистика')
  const headingNote = isLeader
    ? 'Учитываются только ваши персональные занятия руководителя. Организационные занятия исключены.'
    : (!inOrg
      ? 'Учитываются только ваши занятия вне организации. Организационные занятия исключены.'
      : 'Учитываются только персональные занятия. Организационные занятия исключены.')

  // Единая выборка персональных уроков за год и выбранный период (SQLite-friendly)
  const rawForStats = await (prisma as any).lesson.findMany({
    where: { logopedId: userId, settledAt: { not: null, gte: yearStart } },
    include: { enrolls: { include: { child: true } }, transactions: true },
    orderBy: { settledAt: 'desc' },
    take: 5000,
  })
  let lessonsForStats: any[] = (rawForStats as any[]).filter(L => (L.transactions || []).some((t:any)=>t?.meta?.personal===true))
  lessonsForStats = lessonsForStats.filter(L => new Date(L.settledAt) >= periodStart)

  // Личная статистика по всем детям логопеда (активные поимённо, архив — отдельной строкой)
  // Считаем только проведённые занятия текущего года и выбранного периода
  const perChildMap = new Map<string, { name: string; lessons: number; nominal: number }>()
  let archiveLessons = 0
  let archiveNominal = 0
  for (const L of lessonsForStats) {
    const nominal = Number(L.therapistShareAtTime || 0) + Number(L.leaderShareAtTime || 0)
    const child = (L.enrolls || [])[0]?.child
    const childId = child?.id || 'unknown'
    const childName = child ? `${child.lastName || ''} ${child.firstName || ''}`.trim() : ''
    if (child?.isArchived) {
      archiveLessons += 1
      archiveNominal += nominal
    } else {
      const prev = perChildMap.get(childId) || { name: childName || childId, lessons: 0, nominal: 0 }
      prev.lessons += 1
      prev.nominal += nominal
      perChildMap.set(childId, prev)
    }
  }
  const perChild = Array.from(perChildMap.entries()).map(([childId, v]) => ({ childId, childName: v.name, lessons: v.lessons, nominalSum: v.nominal }))
  // Итоги
  const totalLessons = perChild.reduce((s, x) => s + x.lessons, 0) + archiveLessons
  const totalNominal = perChild.reduce((s, x) => s + x.nominalSum, 0) + archiveNominal

  // Прошедшие занятия: фильтр по месяцу (текущий год), только персональные, пагинация по 10
  const currentMonth1 = now.getMonth() + 1 // 1..12
  const sp = (searchParams ? await searchParams : {}) as { period?: string; sent?: string; pending?: string; month?: string; page?: string }
  const selMonth = Math.min(currentMonth1, Math.max(1, Number(sp?.month || currentMonth1)))
  const page = Math.max(1, Number(sp?.page || 1))
  const monthStart = new Date(now.getFullYear(), selMonth - 1, 1)
  const monthEnd = new Date(now.getFullYear(), selMonth, 1)
  const pageSize = 10
  let monthLessonsPage: any[] = []
  let hasMoreMonth = false
  const monthBatchRaw = await (prisma as any).lesson.findMany({
    where: { logopedId: userId, settledAt: { gte: monthStart, lt: monthEnd } },
    include: { enrolls: { include: { child: true } }, transactions: true },
    orderBy: { settledAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize + 1,
  })
  const filtered = (monthBatchRaw as any[]).filter(L => (L.transactions || []).some((t:any)=>t?.meta?.personal===true))
  hasMoreMonth = filtered.length > pageSize
  monthLessonsPage = filtered.slice(0, pageSize)

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div />
        <Link href="/logoped/schedule" className="btn">К расписанию</Link>
      </div>
      {sp?.sent === '1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800">Запрос на выплату отправлен руководителю.</div>
      )}
      {sp?.pending === '1' && (
        <div className="rounded border p-3 bg-amber-50 text-amber-900">У вас уже есть незакрытая заявка на выплату. Ожидайте подтверждения.</div>
      )}

      {/* Личная статистика (всегда сверху) */}
      <section className="section">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{headingText}</h2>
        </div>
        <div className="-mt-2 mb-2 text-xs text-muted">{headingNote}</div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2 pr-4" style={{ maxWidth: '20ch' }}>Ребёнок</th>
                <th className="py-2 pr-4 whitespace-nowrap" style={{ width: '8ch' }}>Занятий</th>
                <th className="py-2 pr-4 whitespace-nowrap" style={{ width: '16ch' }}>Сумма занятий</th>
              </tr>
            </thead>
            <tbody>
              {perChild.length===0 && archiveLessons===0 && (
                <tr><td colSpan={3} className="py-3 text-muted">Данных пока нет</td></tr>
              )}
              {perChild.map((c) => (
                <tr key={c.childId} className="border-t">
                  <td className="py-2 pr-4 truncate" style={{ maxWidth: '20ch' }}>{c.childName || c.childId.slice(0,6)+"…"}</td>
                  <td className="py-2 pr-4 whitespace-nowrap" style={{ width: '8ch' }}>{c.lessons}</td>
                  <td className="py-2 pr-4 whitespace-nowrap" style={{ width: '16ch' }}>{Math.round(c.nominalSum).toLocaleString('ru-RU')} ₽</td>
                </tr>
              ))}
              {true && (
                <tr className="border-t">
                  <td className="py-2 pr-4 font-medium text-muted truncate" style={{ maxWidth: '20ch' }}>В архиве</td>
                  <td className="py-2 pr-4 whitespace-nowrap" style={{ width: '8ch' }}>{archiveLessons}</td>
                  <td className="py-2 pr-4 whitespace-nowrap" style={{ width: '16ch' }}>{Math.round(archiveNominal).toLocaleString('ru-RU')} ₽</td>
                </tr>
              )}
              {(perChild.length>0 || archiveLessons>0) && (
                <tr className="border-t bg-gray-50/50">
                  <td className="py-2 pr-4 font-semibold truncate" style={{ maxWidth: '20ch' }}>Итого</td>
                  <td className="py-2 pr-4 font-semibold whitespace-nowrap" style={{ width: '8ch' }}>{totalLessons}</td>
                  <td className="py-2 pr-4 font-semibold whitespace-nowrap" style={{ width: '16ch' }}>{Math.round(totalNominal).toLocaleString('ru-RU')} ₽</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Прошедшие занятия */}
      <section className="section">
        <div className="mb-3 flex items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">Прошедшие занятия</h2>
            <div className="text-xs text-muted">Показываются только ваши персональные занятия за выбранный месяц текущего года.</div>
          </div>
          <form method="get" className="flex items-end gap-2">
            <input type="hidden" name="period" value={period} />
            <label className="grid gap-1">
              <span className="text-xs text-muted">Месяц</span>
              <select name="month" defaultValue={String(selMonth)} className="input default-select">
                {Array.from({ length: currentMonth1 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{new Date(now.getFullYear(), m-1, 1).toLocaleString('ru-RU', { month: 'long' }).replace(/^./, ch=>ch.toUpperCase())}</option>
                ))}
              </select>
            </label>
            <button className="btn">Показать</button>
          </form>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th className="py-2 pr-4" style={{ maxWidth: '20ch' }}>Ребёнок</th>
                <th className="py-2 pr-4 whitespace-nowrap" style={{ width: '20ch' }}>Дата</th>
                <th className="py-2 pr-4 whitespace-nowrap" style={{ width: '16ch' }}>Цена</th>
              </tr>
            </thead>
            <tbody>
              {monthLessonsPage.length===0 && (
                <tr><td colSpan={3} className="py-3 text-muted">За выбранный месяц занятий нет</td></tr>
              )}
              {monthLessonsPage.map((L:any)=>{
                const child = (L.enrolls||[])[0]?.child
                const name = child ? `${child.lastName||''} ${child.firstName||''}`.trim() : '—'
                const dt = L.settledAt ? new Date(L.settledAt) : (L.startsAt ? new Date(L.startsAt) : null)
                const when = dt ? dt.toLocaleString('ru-RU') : '—'
                const price = Math.round(Number(L.therapistShareAtTime||0) + Number(L.leaderShareAtTime||0))
                return (
                  <tr key={L.id} className="border-t">
                    <td className="py-2 pr-4 truncate" style={{ maxWidth: '20ch' }}>{name || L.id.slice(0,6)+'…'}</td>
                    <td className="py-2 pr-4 whitespace-nowrap" style={{ width: '20ch' }}>{when}</td>
                    <td className="py-2 pr-4 whitespace-nowrap" style={{ width: '16ch' }}>{price>0?price.toLocaleString('ru-RU')+' ₽':'—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {hasMoreMonth && (
          <div className="mt-3">
            <a className="btn btn-outline" href={`/logoped/finance?month=${selMonth}&page=${page+1}`}>Показать ещё</a>
          </div>
        )}
      </section>

    </div>
  )
}
