import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
// confirm payout через API роут, чтобы не зависеть от Server Actions

export default async function AdminFinancePayoutsPage({ searchParams }: { searchParams?: Promise<{ year?: string; export?: string; period?: 'week'|'month'|'6m'|'year'; uid?: string; upage?: string }> }) {
  const sp = (searchParams ? await searchParams : {}) as { year?: string; export?: string; period?: 'week'|'month'|'6m'|'year'; uid?: string; upage?: string }
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const adminId = (session?.user as any)?.id
  if (!session) return <div className="container py-6">Доступ запрещён</div>
  let allowed = ['ADMIN','SUPER_ADMIN'].includes(role)
  if (!allowed && role === 'LOGOPED') {
    const meGuard = await (prisma as any).user.findUnique({ where: { id: adminId }, include: { branch: { include: { company: true } } } })
    const ownedCompany = await (prisma as any).company.findFirst({ where: { ownerId: adminId }, select: { id: true } })
    const managesAny = await (prisma as any).branch.findFirst({ where: { managerId: adminId }, select: { id: true } })
    const isOwnerGuard = Boolean(meGuard?.branch?.company?.ownerId === adminId) || Boolean(ownedCompany)
    const isBranchManagerGuard = Boolean(meGuard?.branch?.managerId === adminId) || Boolean(managesAny)
    allowed = isOwnerGuard || isBranchManagerGuard
  }
  if (!allowed) return <div className="container py-6">Доступ запрещён</div>

  let requests = await (prisma as any).payoutRequest.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    include: { logoped: true },
    take: 50,
  })

  const pendingCount = requests.length
  const uniqueLogopeds = new Set<string>(requests.map((r:any)=> r.logopedId)).size
  const totalPendingAmount = requests.reduce((s:number,r:any)=> s + Number(r.finalAmount||0), 0)

  // Предпросмотр уроков, которые будут включены при подтверждении (только для PENDING)
  const previews: Record<string, { count: number; lessonIds: string[] }> = {}
  for (const r of requests) {
    if (r.status === 'PENDING') {
      const lessons = await (prisma as any).lesson.findMany({
        where: { logopedId: r.logopedId, payoutStatus: 'NONE', settledAt: { lte: r.createdAt } },
        select: { id: true },
        take: 200,
      })
      previews[r.id] = { count: lessons.length, lessonIds: lessons.map((l: any) => l.id) }
    }
  }

  // ==== Блок «Выплачено (период)» ====
  const period = (sp?.period === 'month' || sp?.period === '6m' || sp?.period === 'year') ? sp.period! : 'week'
  const now = new Date()
  const jan1Next = new Date(now.getFullYear() + 1, 0, 1)
  const msLeft = jan1Next.getTime() - now.getTime()
  const daysLeft = Math.max(0, Math.ceil(msLeft / (1000*60*60*24)))
  let from: Date
  let to: Date | undefined
  if (period === 'week') { const d = new Date(now); d.setDate(d.getDate()-7); from = d }
  else if (period === 'month') { const d = new Date(now); d.setMonth(d.getMonth()-1); from = d }
  else if (period === '6m') { const d = new Date(now); d.setMonth(d.getMonth()-6); from = d }
  else { from = new Date(now.getFullYear(), 0, 1); to = new Date(now.getFullYear()+1, 0, 1) }
  const paidWhere: any = { kind: 'PAYOUT', createdAt: { gte: from } }
  if (to) paidWhere.createdAt.lt = to
  const paidTx = await (prisma as any).transaction.findMany({ where: paidWhere, orderBy: { createdAt: 'desc' }, take: 10000 })
  // Группируем по логопедам
  const byUser: Record<string, { sum: number; tx: any[] }> = {}
  for (const t of paidTx) {
    const uid = (t as any).userId as string
    if (!uid) continue
    if (!byUser[uid]) byUser[uid] = { sum: 0, tx: [] }
    byUser[uid].sum += Number((t as any).amount || 0)
    byUser[uid].tx.push(t)
  }
  const userIds = Object.keys(byUser)
  const users = userIds.length ? await (prisma as any).user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : []
  const userMap = new Map<string, { id: string; name?: string|null; email?: string|null }>(
    (users as any[]).map((u:any)=> [u.id as string, u as { id: string; name?: string|null; email?: string|null }])
  )
  // Пагинация по пользователю: по 5 записей, через uid/upage
  const focusedUid = sp?.uid || ''
  const upage = Math.max(1, Number(sp?.upage || 1))

  return (
    <div className="container py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Выплаты</h1>
        <div className="text-xs text-muted">Транзакции у руководителя хранятся 1 год (до 31 декабря), с 1 января начинается новый период</div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="badge badge-info">В ожидании: {pendingCount}</span>
        <span className="badge badge-gray">Логопедов: {uniqueLogopeds}</span>
        <span className="badge badge-green">Сумма: {totalPendingAmount.toLocaleString('ru-RU')} ₽</span>
      </div>
      <div className="overflow-x-auto card-table p-3">
        <table className="min-w-full text-sm table-zebra leading-tight">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-2 pr-4">Дата</th>
              <th className="py-2 pr-4">Логопед</th>
              <th className="py-2 pr-4">Balance</th>
              <th className="py-2 pr-4">Cash Held</th>
              <th className="py-2 pr-4">Итог</th>
              <th className="py-2 pr-4">Уроки</th>
              <th className="py-2 pr-4">Статус</th>
            </tr>
          </thead>
          <tbody>
            {requests.length===0 && (
              <tr><td colSpan={7} className="py-3 text-muted">Запросов на выплату нет</td></tr>
            )}
            {requests.map((r: any) => (
              <tr key={r.id}>
                <td className="py-2 pr-4">{new Date(r.createdAt).toLocaleString('ru-RU')}</td>
                <td className="py-2 pr-4">{r.logoped?.name || r.logoped?.email}</td>
                <td className="py-2 pr-4">{Number(r.balanceAtRequest||0).toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4">{Number(r.cashHeldAtRequest||0).toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4">{Number(r.finalAmount||0).toLocaleString('ru-RU')} ₽</td>
                <td className="py-2 pr-4 align-top">
                  {r.status==='PENDING' ? (
                    <div className="text-xs">
                      <div>Будет включено уроков: <b>{previews[r.id]?.count ?? 0}</b></div>
                      {(previews[r.id]?.lessonIds?.length ?? 0) > 0 && (
                        <details>
                          <summary className="cursor-pointer text-muted">Показать IDs</summary>
                          <div className="max-w-[320px] break-all">{(previews[r.id]?.lessonIds || []).slice(0,50).join(', ')}</div>
                        </details>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <span>{r.status}</span>
                    {r.status==='PENDING' && (
                      <form action="/api/payouts/confirm" method="post" className="flex items-center gap-2">
                        <input type="hidden" name="payoutId" value={r.id} />
                        <input name="amount" type="number" step="0.01" defaultValue={Number(r.finalAmount||0)} className="input !py-1 !px-2 w-36" />
                        <button className="btn btn-primary btn-sm" type="submit">Подтвердить</button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-sm text-muted">Подтверждение выплат и включение уроков добавим следующим шагом (server actions).      </div>

      {/* Выплачено (период) */}
      <section className="section">
        <div className="mb-3 pb-2 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Выплачено (период)
            <span className="ml-2 text-xs text-muted">До сброса {daysLeft} дн.</span>
          </h2>
          <div className="flex items-center gap-2 text-sm">
            <a className={`btn btn-sm ${period==='week'?'btn-secondary':''}`} href={`/admin/finance/payouts?period=week`}>Неделя</a>
            <a className={`btn btn-sm ${period==='month'?'btn-secondary':''}`} href={`/admin/finance/payouts?period=month`}>Месяц</a>
            <a className={`btn btn-sm ${period==='6m'?'btn-secondary':''}`} href={`/admin/finance/payouts?period=6m`}>6 мес.</a>
            <a className={`btn btn-sm ${period==='year'?'btn-secondary':''}`} href={`/admin/finance/payouts?period=year`}>Год</a>
          </div>
        </div>
        <div className="space-y-4">
          {userIds.length===0 && (
            <div className="text-sm text-muted">Нет выплат за выбранный период</div>
          )}
          {userIds.map(uid => {
            const user = userMap.get(uid)
            const list = byUser[uid].tx
            const pageSize = 5
            const page = (focusedUid===uid ? upage : 1)
            const start = (page-1)*pageSize
            const slice = list.slice(start, start+pageSize)
            const hasMore = start + pageSize < list.length
            const total = byUser[uid].sum
            return (
              <div key={uid} className="card-table p-3">
                <div className="mb-2 font-semibold">{user?.name || user?.email || uid}</div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm table-zebra leading-tight">
                    <thead>
                      <tr className="text-left text-muted">
                        <th className="py-2 pr-4">Дата</th>
                        <th className="py-2 pr-4 text-right">Сумма</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice.map((t:any) => (
                        <tr key={t.id}>
                          <td className="py-2 pr-4">{new Date(t.createdAt).toLocaleString('ru-RU')}</td>
                          <td className="py-2 pr-4 text-right">{Number(t.amount||0).toLocaleString('ru-RU')} ₽</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="py-2 pr-4 font-semibold">ИТОГО</td>
                        <td className="py-2 pr-4 font-semibold text-right">{total.toLocaleString('ru-RU')} ₽</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {hasMore && (
                  <div className="mt-2">
                    <a className="btn btn-outline btn-sm" href={`/admin/finance/payouts?period=${period}&uid=${uid}&upage=${page+1}`}>Показать ещё</a>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
