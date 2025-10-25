import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'

function toDateInputValue(d: Date) {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
}

function csvEscape(v: any) {
  const s = v == null ? '' : String(v)
  if (s.includes(';') || s.includes('"') || s.includes('\n')) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export default async function AdminFinanceArchivePage({ searchParams }: { searchParams?: Promise<{ start?: string; end?: string; companyId?: string; branchId?: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const adminId = (session?.user as any)?.id
  if (!session) return <div className="container py-6">Доступ запрещён</div>
  let allowed = ['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)
  let isOwner = false
  let isBranchManager = false
  const me = await (prisma as any).user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
  if (!allowed && role === 'LOGOPED') {
    const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: adminId }, select: { id: true } })
    const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: adminId }, select: { id: true } })
    isOwner = Boolean(me?.branch?.company?.ownerId === adminId) || Boolean(ownedCompany)
    isBranchManager = Boolean(me?.branch?.managerId === adminId) || Boolean(managesAny)
    allowed = isOwner || isBranchManager
  } else {
    isOwner = Boolean(me?.branch?.company?.ownerId === adminId)
    isBranchManager = Boolean(me?.branch?.managerId === adminId)
  }
  if (!allowed) return <div className="container py-6">Доступ запрещён</div>

  // Период по умолчанию: последние 30 дней
  const now = new Date()
  const startDefault = new Date(now); startDefault.setDate(startDefault.getDate() - 30)
  const sp = (searchParams ? await searchParams : {}) as { start?: string; end?: string; companyId?: string; branchId?: string }
  const start = sp?.start ? new Date(sp.start) : startDefault
  const end = sp?.end ? new Date(sp.end) : now

  // Фильтры скоупа (бережёмся от проблем с валидацией Prisma):
  // В БД фильтруем только по компании/филиалу. По датам и archived фильтруем ПОСЛЕ выборки.
  const where: any = {}
  if (role === 'ACCOUNTANT') {
    if (sp?.companyId) where.companyId = sp.companyId
    if (sp?.branchId) where.branchId = sp.branchId
  } else if ((isOwner || isBranchManager) && me?.branchId) {
    where.branchId = me.branchId
    // Личные занятия руководителя считаются SOLO и не попадают в орг-архив
    // Relation-фильтры опускаем и отфильтруем после выборки
  }

  let tx: any[] = []
  let fallbackNoArchived = false
  try {
    tx = await (prisma as any).transaction.findMany({
      where,
      include: { lesson: true },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    })
    // Пост-фильтрация по периоду и архиву
    tx = tx.filter((t: any) => new Date(t.createdAt) >= start && new Date(t.createdAt) <= end)
    tx = tx.filter((t: any) => Boolean(t.archivedAt))
    // Исключаем личные занятия руководителя из орг-архива (после выборки)
    if (role !== 'ACCOUNTANT' && (isOwner || isBranchManager)) {
      tx = tx.filter((t: any) => t.lesson?.logopedId !== adminId)
    }
  } catch (e) {
    // Fallback: та же выборка, но оставляем как есть — пост-фильтрация ниже
    tx = await (prisma as any).transaction.findMany({
      where,
      include: { lesson: { include: { child: true, logoped: true, group: { include: { branch: { include: { company: true } } } } } } },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    })
    tx = tx.filter((t: any) => new Date(t.createdAt) >= start && new Date(t.createdAt) <= end)
    // Исключаем личные занятия руководителя из орг-архива (после выборки)
    if (role !== 'ACCOUNTANT' && (isOwner || isBranchManager)) {
      tx = tx.filter((t: any) => t.lesson?.logopedId !== adminId)
    }
    fallbackNoArchived = true
  }

  const companies = role==='ACCOUNTANT' ? await (prisma as any).company.findMany({ orderBy: { name: 'asc' } }) : []
  const branches = role==='ACCOUNTANT' ? await (prisma as any).branch.findMany({ orderBy: { name: 'asc' } }) : []

  const header = ['Дата','Тип','Сумма','LessonId'].join(';')
  const rows = tx.map((t: any) => [
    new Date(t.createdAt).toLocaleString('ru-RU'),
    t.kind,
    Number(t.amount || 0),
    t.lessonId || '',
  ].map(csvEscape).join(';'))
  const csv = [header, ...rows].join('\n')

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Архив</h1>
      </div>

      <form className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs mb-1">С</label>
          <input type="date" name="start" className="input" defaultValue={toDateInputValue(start)} />
        </div>
        <div>
          <label className="block text-xs mb-1">По</label>
          <input type="date" name="end" className="input" defaultValue={toDateInputValue(end)} />
        </div>
        {role==='ACCOUNTANT' && (
          <>
            <div>
              <label className="block text-xs mb-1">Компания</label>
              <select name="companyId" className="input default-select">
                <option value="">Все</option>
                {companies.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1">Филиал</label>
              <select name="branchId" className="input default-select">
                <option value="">Все</option>
                {branches.map((b: any) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </div>
          </>
        )}
        <button className="btn">Показать</button>
      </form>

      {fallbackNoArchived && (
        <div className="rounded border p-3 bg-amber-50 text-amber-900">Внимание: колонка архива пока недоступна. Показаны записи за период без учета архивации. Примените миграции в БД.</div>
      )}
      <div className="flex gap-2">
        <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} download={`archive_${toDateInputValue(start)}_${toDateInputValue(end)}.csv`} className="btn btn-outline btn-sm">Экспорт CSV</a>
      </div>

      <div className="overflow-x-auto card-table p-3">
        <table className="min-w-full text-sm table-zebra leading-tight">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-4">Дата</th>
              <th className="py-2 pr-4">Тип</th>
              <th className="py-2 pr-4 text-right">Сумма</th>
              <th className="py-2 pr-4">LessonId</th>
            </tr>
          </thead>
          <tbody>
            {tx.length===0 && (<tr><td colSpan={7} className="py-3 text-muted">Нет записей за выбранный период</td></tr>)}
            {tx.map((t: any) => (
              <tr key={t.id}>
                <td className="py-2 pr-4">{new Date(t.createdAt).toLocaleString('ru-RU')}</td>
                <td className="py-2 pr-4">{t.kind}</td>
                <td className="py-2 pr-4 text-right">{Number(t.amount||0).toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4">{t.lessonId || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
