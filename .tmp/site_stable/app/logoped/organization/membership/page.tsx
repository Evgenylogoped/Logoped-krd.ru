import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requestMembership } from './actions'
import { acceptInvite, declineInvite, cancelMembershipRequest, leaveOrganization } from './actions'

export default async function MembershipRequestPage({ searchParams }: { searchParams?: Promise<{ sent?: string; err?: string; cancelled?: string; left?: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session?.user || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>
  const userId = (session.user as any).id as string
  const me = await prisma.user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } })
  const inOrg = Boolean(me?.branchId)
  const lastReq = await prisma.organizationMembershipRequest.findFirst({ where: { requesterId: userId }, orderBy: { createdAt: 'desc' } })
  const isPending = !inOrg && lastReq?.status === 'PENDING'
  const isRejected = !inOrg && lastReq?.status === 'REJECTED'
  // Приглашения от руководителей (reason='INVITE') адресованы текущему логопеду (requesterId = me.id)
  const invites = await prisma.organizationMembershipRequest.findMany({
    where: { requesterId: userId, status: 'PENDING', reason: 'INVITE' as any },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  const sp = (searchParams ? await searchParams : {}) as { sent?: string; err?: string; cancelled?: string; left?: string }
  return (
    <div className="container py-6 max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Запрос на вступление в организацию</h1>
      {sp?.err==='owner_cannot_leave' && (
        <div className="rounded border p-3 bg-amber-50 text-amber-900 text-sm">Вы — владелец компании. Передайте права владельца прежде чем выйти.</div>
      )}
      {sp?.err==='billing_block' && (
        <div className="rounded border p-3 bg-amber-50 text-amber-900 text-sm">Нельзя выйти: есть незакрытые организационные начисления. Завершите взаиморасчёт с руководителем в разделе <a className="underline" href="/logoped/finance" target="_blank">Лог. финансы</a>.</div>
      )}
      {sp?.left==='1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Вы вышли из организации.</div>
      )}
      {sp?.cancelled === '1' && (
        <div className="rounded border p-3 bg-amber-50 text-amber-900 text-sm">Запрос отменён.</div>
      )}
      {inOrg && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm space-y-2">
          <div>Вы состоите в организации{me?.branch?.company?.name ? `: ${me.branch.company.name}` : ''}.</div>
          <form action={leaveOrganization}>
            <button className="btn btn-danger btn-sm">Выйти из организации</button>
          </form>
        </div>
      )}
      {!inOrg && isPending && (
        <div className="rounded border p-3 bg-indigo-50 text-indigo-900 text-sm">Ваш запрос отправлен руководителю и находится на рассмотрении.</div>
      )}
      {!inOrg && isRejected && (
        <div className="rounded border p-3 bg-amber-50 text-amber-900 text-sm">Запрос отклонён{lastReq?.reason ? `: ${lastReq.reason}` : '.'} Вы можете отправить новый запрос.</div>
      )}
      {sp?.err === 'pending' && (
        <div className="rounded border p-3 bg-indigo-50 text-indigo-900 text-sm">Запрос уже отправлен и находится на рассмотрении. Дождитесь решения.</div>
      )}
      {sp?.err === 'in_org' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Вы уже состоите в организации. Чтобы подать новый запрос, сначала выйдите из текущей.</div>
      )}
      {sp?.sent === '1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Запрос отправлен руководителю.</div>
      )}
      <form action={requestMembership} className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-sm text-muted">E-mail руководителя</span>
          <input name="leaderEmail" type="email" required className="input" placeholder="leader@domain.ru" disabled={Boolean(inOrg || isPending)} />
        </label>
        <div>
          <button className="btn btn-primary" disabled={Boolean(inOrg || isPending)}>Отправить запрос</button>
        </div>
      </form>
      {!inOrg && invites.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="font-medium">Приглашения от руководителей</div>
          {invites.map((r:any)=> (
            <div key={r.id} className="p-3 rounded-md border flex items-center justify-between" style={{ background: 'var(--card-bg)' }}>
              <div className="text-sm">
                <div>Руководитель: {r.leaderEmail}</div>
                <div className="text-muted">{new Date(r.createdAt).toLocaleString('ru-RU')}</div>
              </div>
              <div className="flex items-center gap-2">
                <form action={acceptInvite}>
                  <input type="hidden" name="reqId" value={r.id} />
                  <button className="btn btn-secondary btn-sm">Принять</button>
                </form>
                <form action={declineInvite} className="flex items-center gap-1">
                  <input type="hidden" name="reqId" value={r.id} />
                  <input name="reason" className="input !py-1 !px-2" placeholder="Причина (опц.)" />
                  <button className="btn btn-danger btn-sm">Отклонить</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
      {!inOrg && isPending && lastReq?.id && (
        <form action={cancelMembershipRequest} className="mt-2">
          <input type="hidden" name="reqId" value={lastReq.id} />
          <button className="btn btn-outline btn-sm">Отменить запрос</button>
        </form>
      )}
    </div>
  )
}
