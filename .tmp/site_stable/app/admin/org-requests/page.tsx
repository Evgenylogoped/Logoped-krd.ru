import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { approveOrganizationRequest, rejectOrganizationRequest } from './actions'

export default async function AdminOrgRequestsPage({ searchParams }: { searchParams?: Promise<Record<string,string>> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>
  const sp = (searchParams ? await searchParams : {}) as Record<string,string>
  const status = String(sp?.status || '')
  const q = String(sp?.q || '')

  const and: any[] = []
  if (status) and.push({ status })
  if (q) and.push({ OR: [ { name: { contains: q, mode: 'insensitive' } }, { requester: { name: { contains: q, mode: 'insensitive' } } }, { requester: { email: { contains: q, mode: 'insensitive' } } } ] })

  const where: any = and.length ? { AND: and } : {}
  const client: any = prisma as any
  const orgReqModel = client.organizationRequest
  const rows = orgReqModel ? await orgReqModel.findMany({ where, include: { requester: true }, orderBy: { createdAt: 'desc' }, take: 200 }) : []

  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Заявки организаций</h1>
      {!orgReqModel && (
        <div className="rounded border p-3 bg-amber-50 text-amber-900 text-sm">
          Модель OrganizationRequest отсутствует в Prisma Client. Пожалуйста, обновите схему и выполните генерацию клиента/миграцию (например, <code>npx prisma generate</code> и <code>npx prisma db push</code>).
        </div>
      )}
      {(sp as any)?.ok === 'approved' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Заявка утверждена</div>
      )}
      {(sp as any)?.ok === 'rejected' && (
        <div className="rounded border p-3 bg-amber-50 text-amber-800 text-sm">Заявка отклонена</div>
      )}

      <form method="get" className="grid gap-3 md:grid-cols-4 items-end">
        <label className="grid gap-1">
          <span className="text-sm">Статус</span>
          <select name="status" className="input !py-2 !px-2" defaultValue={status}>
            <option value="">Все</option>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </label>
        <label className="grid gap-1 md:col-span-2">
          <span className="text-sm">Поиск (название, логопед, email)</span>
          <input name="q" className="input" defaultValue={q} />
        </label>
        <div><button className="btn">Найти</button></div>
      </form>

      <div className="overflow-auto">
        <table className="table w-full text-sm">
          <thead>
            <tr>
              <th>Дата</th>
              <th>Организация</th>
              <th>Логопед</th>
              <th>Статус</th>
              <th>Действия</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleString('ru-RU')}</td>
                <td>
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-xs text-muted">{r.website || '—'}</div>
                  {r.about && <div className="text-xs text-muted max-w-[360px] truncate">{r.about}</div>}
                </td>
                <td>
                  <div>{r.requester.name || r.requester.email}</div>
                  <div className="text-xs text-muted">{r.requester.email}</div>
                </td>
                <td>{r.status}</td>
                <td>
                  {r.status === 'PENDING' ? (
                    <div className="flex flex-col gap-2 min-w-[280px]">
                      <form action={approveOrganizationRequest} className="flex items-center gap-2">
                        <input type="hidden" name="requestId" value={r.id} />
                        <input name="allowedBranches" type="number" min={1} className="input w-24" placeholder="Филиалы" defaultValue={1} />
                        <button className="btn btn-primary btn-sm">Утвердить</button>
                      </form>
                      <form action={rejectOrganizationRequest} className="flex items-center gap-2">
                        <input type="hidden" name="requestId" value={r.id} />
                        <input name="reason" className="input" placeholder="Причина" required />
                        <button className="btn btn-danger btn-sm">Отклонить</button>
                      </form>
                    </div>
                  ) : (
                    <div className="text-xs text-muted">{r.status === 'REJECTED' ? r.reason || '—' : ''}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
