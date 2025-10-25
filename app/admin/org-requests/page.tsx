import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { approveOrganizationRequest, rejectOrganizationRequest } from './actions'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

export default async function AdminOrgRequestsPage({ searchParams }: { searchParams?: Promise<Record<string,string>> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>
  const sp = (searchParams ? await searchParams : {}) as Record<string,string>
  const status = String(sp?.status || '')
  const q = String(sp?.q || '')

  const and: any[] = []
  if (status) and.push({ status })
  if (q) and.push({
    OR: [
      { name: { contains: q } },
      { requester: { is: { name: { contains: q } } } },
      { requester: { is: { email: { contains: q } } } },
    ],
  })
  // Note: we avoid unsupported relation filters like isNot on Prisma 6.x

  // Берём все заявки; поле requesterId в схеме обязательное, дополнительный фильтр не нужен
  const where: any = and.length ? { AND: and } : {}
  const client: any = prisma as any
  const orgReqModel = client.organizationRequest
  let rows: any[] = []
  let fallbackUsed = false
  let errorMsg: string | null = null
  if (orgReqModel) {
    try {
      rows = await orgReqModel.findMany({ where, include: { requester: true }, orderBy: { createdAt: 'desc' }, take: 200 })
    } catch (e: any) {
      console.warn('[org-requests] query failed; trying fallback without include', e)
      errorMsg = e?.message || String(e)
      fallbackUsed = true
      // Fallback: fetch without include and hydrate requester manually
      const bare = await orgReqModel.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 })
      const ids = Array.from(new Set(bare.map((r: any) => r.requesterId).filter(Boolean)))
      const users = ids.length ? await (prisma as any).user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, email: true } }) : []
      const byId: Record<string, any> = {}
      users.forEach((u: any) => { byId[u.id] = u })
      rows = bare.map((r: any) => ({ ...r, requester: byId[r.requesterId as string] || null }))
    }
  }

  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Заявки организаций</h1>
      {fallbackUsed && (
        <div className="rounded border p-3 bg-amber-50 text-amber-900 text-sm">
          Предупреждение: основной запрос не удался, данные загружены в безопасном режиме. Возможны неполные сведения о заявителях.
          {errorMsg ? (<div className="mt-1 text-xs text-muted">{errorMsg}</div>) : null}
        </div>
      )}
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
          <Select name="status" className="!py-2 !px-2" defaultValue={status}>
            <option value="">Все</option>
            <option value="PENDING">PENDING</option>
            <option value="APPROVED">APPROVED</option>
            <option value="REJECTED">REJECTED</option>
          </Select>
        </label>
        <label className="grid gap-1 md:col-span-2">
          <span className="text-sm">Поиск (название, логопед, email)</span>
          <Input name="q" defaultValue={q} />
        </label>
        <div><Button type="submit">Найти</Button></div>
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
            {rows.filter((r:any)=>!!r.requester).map((r: any) => (
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
                        <Input name="allowedBranches" type="number" min={1} className="w-24" placeholder="Филиалы" defaultValue={1} />
                        <Button variant="primary" size="sm">Утвердить</Button>
                      </form>
                      <form action={rejectOrganizationRequest} className="flex items-center gap-2">
                        <input type="hidden" name="requestId" value={r.id} />
                        <Input name="reason" placeholder="Причина" required />
                        <Button variant="danger" size="sm">Отклонить</Button>
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
