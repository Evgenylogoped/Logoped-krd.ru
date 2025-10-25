import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { approveMembership, rejectMembership } from '../membership/actions'

export const dynamic = 'force-dynamic'

export default async function MembershipsInboxPage({ searchParams }: { searchParams?: Promise<{ done?: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const email = (session?.user as any)?.email as string | undefined
  if (!session?.user || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>
  if (!email) return <div className="container py-6">Нет email в профиле</div>

  const items = await (prisma as any).organizationMembershipRequest.findMany({
    where: {
      leaderEmail: String(email).toLowerCase(),
      status: 'PENDING',
      requester: { branchId: null },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { requester: { include: { branch: { include: { company: true } } } } },
  })

  const sp = (searchParams ? await searchParams : {}) as { done?: string }
  return (
    <div className="container py-6 space-y-4 max-w-3xl">
      <h1 className="text-2xl font-bold">Запросы на вступление</h1>
      {sp?.done && (
        <div className={`rounded border p-3 text-sm ${sp.done==='approved' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-900'}`}>
          {sp.done==='approved' ? 'Заявка одобрена.' : 'Заявка отклонена.'}
        </div>
      )}
      <div className="rounded border p-3 text-sm bg-slate-50">Здесь отображаются запросы логопедов на вступление в вашу организацию.</div>
      <div className="space-y-2">
        {items.length === 0 && <div className="text-sm text-muted">Запросов нет</div>}
        {items.map((r:any)=> (
          <div key={r.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 rounded-md border bg-white shadow-sm">
            <div>
              <div className="font-medium">{r.requester?.name || r.requester?.email}</div>
              <div className="text-xs text-muted">{r.requester?.email}</div>
              {r.requester?.branch?.company?.name && (
                <div className="text-xs text-amber-700">Уже состоит: {r.requester.branch.company.name}</div>
              )}
              <div className="text-sm text-muted">{new Date(r.createdAt).toLocaleString('ru-RU')}</div>
            </div>
            <div className="flex gap-2">
              <form action={approveMembership}>
                <input type="hidden" name="reqId" value={r.id} />
                <button className="btn btn-secondary btn-sm">Принять</button>
              </form>
              <form action={rejectMembership} className="flex items-center gap-2">
                <input type="hidden" name="reqId" value={r.id} />
                <input name="reason" className="input" placeholder="Причина (опц.)" />
                <button className="btn btn-danger btn-sm">Отклонить</button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
