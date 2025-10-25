import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { approveConsultationRequest, rejectConsultationRequest, approveParentBooking, rejectParentBooking } from '../schedule/actions'
import VipBadge from '@/components/VipBadge'
import { approveTransfer, rejectTransfer } from '../child/[id]/actions'
import { approveParentActivation, rejectParentActivation, markAllRead } from './actions'

export default async function LogopedNotificationsPage({ searchParams }: { searchParams: Promise<{ consult?: string }> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','LOGOPED'].includes(role)) return <div>Доступ запрещён</div>
  const userId = (session.user as any).id as string
  const dbUser = await (prisma as any).user.findUnique({ where: { id: userId } })
  const lastSeen = dbUser?.lastNotificationsSeenAt ? new Date(dbUser.lastNotificationsSeenAt) : new Date(0)
  const now = new Date()
  const isMonday = now.getDay() === 1 // 1 = Monday
  const cutoff = new Date(now.getTime() - 7*24*60*60*1000)

  const incomingPending = await (prisma as any).consultationRequest.findMany({
    where: { subordinateId: userId, status: 'PENDING' },
    include: { lesson: true, supervisor: true },
    orderBy: { createdAt: 'desc' },
  })

  // Бронирования от родителей (активные) — мои слоты
  const parentBookings = await (prisma as any).booking.findMany({
    where: { status: 'ACTIVE', lesson: { logopedId: userId } },
    include: { lesson: true, child: true },
    orderBy: { createdAt: 'desc' },
  })
  const incomingHistoryRaw = await (prisma as any).consultationRequest.findMany({
    where: { subordinateId: userId, status: { in: ['APPROVED','REJECTED'] } },
    include: { lesson: true, supervisor: true },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  const incomingHistory = isMonday ? (incomingHistoryRaw as any[]).filter(r => new Date(r.createdAt) >= cutoff) : incomingHistoryRaw
  const outgoing = await (prisma as any).consultationRequest.findMany({
    where: { supervisorId: userId },
    include: { lesson: true, subordinate: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  const parentActivations = await (prisma as any).activationRequest.findMany({
    where: { targetLogopedId: userId, status: 'PENDING' },
    include: { parent: { include: { user: true } } },
    orderBy: { createdAt: 'desc' },
  })

  // История заявок активации (перенесено из раздела Клиенты)
  const activationHistoryRaw = await (prisma as any).activationRequest.findMany({
    where: { targetLogopedId: userId, status: { in: ['APPROVED','REJECTED'] } },
    include: { parent: { include: { user: true } } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  const activationHistory = isMonday ? (activationHistoryRaw as any[]).filter(r => new Date(r.createdAt) >= cutoff) : activationHistoryRaw

  // Входящие запросы на вступление в организацию для меня как руководителя (по leaderEmail)
  const leaderEmail = String((session.user as any).email || '').toLowerCase()
  const incomingOrgMemberships = leaderEmail
    ? await (prisma as any).organizationMembershipRequest.findMany({
        where: { leaderEmail: leaderEmail, status: 'PENDING' },
        include: { requester: true },
        orderBy: { createdAt: 'desc' },
        take: 20,
      })
    : []

  // Передачи детей (входящие для меня)
  const transferIncomingPending = await ((prisma as any).transferRequest?.findMany
    ? (prisma as any).transferRequest.findMany({
        where: { toLogopedId: userId, status: 'PENDING' },
        include: { child: true, fromLogoped: true, toLogoped: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    : Promise.resolve([]))
  const transferIncomingHistory = await ((prisma as any).transferRequest?.findMany
    ? (prisma as any).transferRequest.findMany({
        where: { toLogopedId: userId, status: { in: ['APPROVED','REJECTED'] } },
        include: { child: true, fromLogoped: true, toLogoped: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      })
    : Promise.resolve([]))

  // Заявки на создание организации (мои)
  const orgRequests = await (prisma as any).organizationRequest.findMany({
    where: { requesterId: userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })
  // Запросы на вступление (мои)
  const myMemberships = await (prisma as any).organizationMembershipRequest.findMany({
    where: { requesterId: userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  const consultState = sp?.consult as string | undefined

  function vipScore(u: any): number { return u?.featuredSuper ? 2 : u?.featured ? 1 : 0 }

  const incomingPendingSorted = [...incomingPending].sort((a:any,b:any)=> vipScore(b.supervisor)-vipScore(a.supervisor))
  const incomingHistorySorted = [...incomingHistory].sort((a:any,b:any)=> vipScore(b.supervisor)-vipScore(a.supervisor))
  const outgoingSorted = [...outgoing].sort((a:any,b:any)=> vipScore(b.subordinate)-vipScore(a.subordinate))
  const transferIncomingPendingSorted = [...transferIncomingPending].sort((a:any,b:any)=> (vipScore(b.fromLogoped)||vipScore(b.toLogoped))-(vipScore(a.fromLogoped)||vipScore(a.toLogoped)))
  const transferIncomingHistorySorted = [...transferIncomingHistory].sort((a:any,b:any)=> (vipScore(b.fromLogoped)||vipScore(b.toLogoped))-(vipScore(a.fromLogoped)||vipScore(a.toLogoped)))

  return (
    <div className="container space-y-6 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Центр уведомлений</h1>
        <form action={markAllRead}>
          <button className="btn btn-outline btn-sm" title="Отметить все уведомления как прочитанные">Отметить всё как прочитанное</button>
        </form>
      </div>

      {consultState && (
        <div className={`rounded border p-3 ${consultState==='approved' ? 'bg-emerald-50 text-emerald-800' : consultState==='rejected' ? 'bg-amber-50 text-amber-900' : 'bg-indigo-50 text-indigo-900'}`}>
          {consultState==='approved' && 'Заявка принята.'}
          {consultState==='rejected' && 'Заявка отклонена.'}
          {consultState==='sent' && 'Запрос консультации отправлен.'}
        </div>
      )}

      <section className="section" style={{ background: 'var(--card-bg)' }}>
        <h2 className="mb-3 text-lg font-semibold">Заявки родителей на запись</h2>
        <div className="space-y-2">
          {parentBookings.length === 0 && <div className="text-sm text-muted">Нет активных заявок</div>}
          {parentBookings.slice(0,1).map((b: any) => (
            <div key={b.id} className="flex flex-col gap-2 p-3 rounded-md border shadow-sm sm:flex-row sm:items-center sm:justify-between" style={{ background: 'var(--card-bg)' }}>
              <div className="text-sm">
                <div className="font-medium">{b.child?.lastName} {b.child?.firstName}</div>
                <div className="text-muted">Занятие: {new Date(b.lesson.startsAt).toLocaleString('ru-RU')} — {new Date(b.lesson.endsAt).toLocaleString('ru-RU')}</div>
                <div className="text-muted">Создано: {new Date(b.createdAt).toLocaleString('ru-RU')} · Имя для брони: {b.holder}</div>
              </div>
              <div className="flex gap-2">
                <form action={approveParentBooking}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <button className="btn btn-secondary btn-sm">Принять</button>
                </form>
                <form action={rejectParentBooking}>
                  <input type="hidden" name="bookingId" value={b.id} />
                  <button className="btn btn-danger btn-sm">Отклонить</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section" style={{ background: 'var(--card-bg)' }}>
        <h2 className="mb-3 text-lg font-semibold">Заявки на вступление в организацию</h2>
        <div className="space-y-2">
          {incomingOrgMemberships.length === 0 && <div className="text-sm text-muted">Нет входящих заявок</div>}
          {incomingOrgMemberships.slice(0,1).map((r: any) => (
            <div key={r.id} className="flex items-center justify-between p-3 text-sm rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
              <div>
                <div className="font-medium flex items-center gap-2 flex-wrap">{r.requester?.name || r.requester?.email}{((r.requester as any)?.featuredSuper || (r.requester as any)?.featured) && (
                  <VipBadge level={(r.requester as any).featuredSuper ? 'VIP+' : 'VIP'} />
                )}</div>
                <div className="text-muted">{r.requester?.email} · {new Date(r.createdAt).toLocaleString('ru-RU')}</div>
              </div>
              <div className="flex items-center gap-2">
                <a href="/settings/organization/memberships" className="btn btn-secondary btn-xs">Открыть</a>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section" style={{ background: 'var(--card-bg)' }}>
        <h2 className="mb-3 text-lg font-semibold">Передачи детей (ожидают решения)</h2>
        <div className="space-y-2">
          {transferIncomingPendingSorted.length === 0 && <div className="text-sm text-muted">Нет входящих передач</div>}
          {transferIncomingPendingSorted.slice(0,1).map((t: any) => (
            <div key={t.id} className="flex flex-col gap-2 p-3 rounded-md border shadow-sm sm:flex-row sm:items-center sm:justify-between" style={{ background: 'var(--card-bg)' }}>
              <div className="text-sm">
                <div className="font-medium">Запрос на передачу ребёнка</div>
                <div className="text-muted">Ребёнок: {t.child?.lastName} {t.child?.firstName} · от: <span className="inline-flex items-center gap-2">{t.fromLogoped?.name || t.fromLogoped?.email}{((t.fromLogoped as any)?.featuredSuper || (t.fromLogoped as any)?.featured) && (
                  <VipBadge level={(t.fromLogoped as any).featuredSuper ? 'VIP+' : 'VIP'} />
                )}</span></div>
                <div className="text-muted">{new Date(t.createdAt).toLocaleString('ru-RU')}</div>
              </div>
              <div className="flex gap-2">
                <form action={approveTransfer}>
                  <input type="hidden" name="transferId" value={t.id} />
                  <button className="btn btn-secondary btn-sm">Подтвердить</button>
                </form>
                <form action={rejectTransfer}>
                  <input type="hidden" name="transferId" value={t.id} />
                  <button className="btn btn-danger btn-sm">Отклонить</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Передачи детей — история</h2>
        <div className="space-y-2">
          {transferIncomingHistory.length === 0 && <div className="text-sm text-muted">Истории нет</div>}
          {transferIncomingHistory.map((t: any) => (
            <div key={t.id} className="flex items-center justify-between p-3 text-sm rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
              <div>
                <div className="font-medium">Ребёнок: {t.child?.lastName} {t.child?.firstName}</div>
                <div className="text-muted">{new Date(t.createdAt).toLocaleString('ru-RU')}</div>
              </div>
              <span className={`badge ${t.status==='APPROVED'?'badge-green':'badge-amber'}`}>{t.status==='APPROVED'?'Принято':'Отклонено'}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Входящие заявки (ожидают решения)</h2>
        <div className="space-y-2">
          {incomingPendingSorted.length === 0 && <div className="text-sm text-muted">Нет заявок</div>}
          {incomingPendingSorted.slice(0,1).map((r: any) => (
            <div key={r.id} className="flex flex-col gap-2 p-3 rounded-md border shadow-sm sm:flex-row sm:items-center sm:justify-between" style={{ background: 'var(--card-bg)' }}>
              <div className="text-sm">
                <div className="font-medium">От: <span className="inline-flex items-center gap-2">{r.supervisor.name || r.supervisor.email}{((r.supervisor as any)?.featuredSuper || (r.supervisor as any)?.featured) && (
                  <VipBadge level={(r.supervisor as any).featuredSuper ? 'VIP+' : 'VIP'} />
                )}</span></div>
                <div className="text-muted">Слот: {new Date(r.lesson.startsAt).toLocaleString('ru-RU')}</div>
                <div className="text-muted">Родитель: {r.parentEmail} · Ребёнок: {r.childLastName} {r.childFirstName}</div>
                {r.note && <div className="text-muted">Комментарий: {r.note}</div>}
              </div>
              <div className="flex gap-2">
                <form action={approveConsultationRequest}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <button className="btn btn-secondary btn-sm">Принять</button>
                </form>
                <form action={rejectConsultationRequest}>
                  <input type="hidden" name="requestId" value={r.id} />
                  <button className="btn btn-danger btn-sm">Отклонить</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Мои заявки на создание организации</h2>
        <div className="space-y-2">
          {orgRequests.length === 0 && <div className="text-sm text-muted">Заявок нет</div>}
          {orgRequests.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between p-3 text-sm rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-muted flex items-center gap-2">{new Date(r.createdAt).toLocaleString('ru-RU')}
                  {new Date(r.createdAt) > lastSeen && <span className="badge badge-blue">Новое</span>}
                </div>
                {r.reason && r.status==='REJECTED' && <div className="text-amber-700">Причина: {r.reason}</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${r.status==='APPROVED'?'badge-green': r.status==='REJECTED'?'badge-amber':'badge'}`}>{({PENDING:'На рассмотрении', APPROVED:'Одобрено', REJECTED:'Отклонено'} as any)[r.status]}</span>
                {r.status==='APPROVED' && (
                  <a href="/settings/organization" className="underline">Настройки →</a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Мои запросы на вступление в организацию</h2>
        <div className="space-y-2">
          {myMemberships.length === 0 && <div className="text-sm text-muted">Запросов нет</div>}
          {myMemberships.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between p-3 text-sm rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
              <div>
                <div className="font-medium">Руководитель: {r.leaderEmail}</div>
                <div className="text-muted flex items-center gap-2">{new Date(r.createdAt).toLocaleString('ru-RU')}
                  {new Date(r.createdAt) > lastSeen && <span className="badge badge-blue">Новое</span>}
                </div>
                {r.reason && r.status==='REJECTED' && <div className="text-amber-700">Причина: {r.reason}</div>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${r.status==='APPROVED'?'badge-green': r.status==='REJECTED'?'badge-amber':'badge'}`}>{({PENDING:'На рассмотрении', APPROVED:'Одобрено', REJECTED:'Отклонено'} as any)[r.status]}</span>
                {r.status==='APPROVED' && (
                  <a href="/settings/organization" className="underline">Настройки →</a>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">История заявок активации родителей</h2>
        <div className="space-y-2">
          {activationHistory.length === 0 && <div className="text-sm text-muted">Истории нет</div>}
          {activationHistory.map((r: any) => (
            <div key={r.id} className="p-3 text-sm rounded-md border shadow-sm flex items-center justify-between" style={{ background: 'var(--card-bg)' }}>
              <div>
                <div className="font-medium flex items-center gap-2 flex-wrap">{r.parent.user.name || r.parent.user.email}{(((r.parent.user as any)?.featuredSuper) || ((r.parent.user as any)?.featured)) && (
                  <VipBadge level={(r.parent.user as any).featuredSuper ? 'VIP+' : 'VIP'} />
                )}</div>
                <div className="text-muted">{new Date(r.createdAt).toLocaleString('ru-RU')}</div>
              </div>
              <span className={`badge ${r.status==='APPROVED'?'badge-green':'badge-amber'}`}>{r.status==='APPROVED'?'Одобрено':'Отклонено'}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="parent-activations" style={{ background: 'var(--card-bg)' }}>
        <h2 className="mb-3 text-lg font-semibold">Заявки активации родителей</h2>
        <div className="space-y-2">
          {parentActivations.length === 0 && <div className="text-sm text-muted">Нет заявок</div>}
          {parentActivations.slice(0,1).map((a: any) => (
            <div key={a.id} className="flex flex-col gap-2 p-3 rounded-md border shadow-sm sm:flex-row sm:items-center sm:justify-between" style={{ background: 'var(--card-bg)' }}>
              <div className="text-sm">
                <div className="font-medium">Родитель: {a.parent.fullName || a.parent.user.name || a.parent.user.email}</div>
                <div className="text-muted">E-mail: {a.parent.user.email} {a.note ? `· Комментарий: ${a.note}` : ''}</div>
              </div>
              <div className="flex gap-2">
                <form action={approveParentActivation}>
                  <input type="hidden" name="requestId" value={a.id} />
                  <button className="btn btn-secondary btn-sm">Подтвердить</button>
                </form>
                <form action={rejectParentActivation}>
                  <input type="hidden" name="requestId" value={a.id} />
                  <button className="btn btn-danger btn-sm">Отклонить</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Входящие — история</h2>
        <div className="space-y-2">
          {incomingHistory.length === 0 && <div className="text-sm text-muted">Истории нет</div>}
          {incomingHistory.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between p-3 text-sm rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
              <div>
                <div className="font-medium">От: {r.supervisor.name || r.supervisor.email}</div>
                <div className="text-muted">{new Date(r.lesson.startsAt).toLocaleString('ru-RU')} · {new Date(r.createdAt).toLocaleString('ru-RU')}</div>
              </div>
              <span className={`badge ${r.status==='APPROVED'?'badge-green':'badge-amber'}`}>{r.status==='APPROVED'?'Одобрено':'Отклонено'}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Исходящие заявки (я — руководитель)</h2>
        <div className="space-y-2">
          {outgoing.length === 0 && <div className="text-sm text-muted">Нет отправленных заявок</div>}
          {outgoing.map((r: any) => (
            <div key={r.id} className="flex items-center justify-between p-3 text-sm rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
              <div>
                <div className="font-medium">Кому: {r.subordinate.name || r.subordinate.email}</div>
                <div className="text-muted">{new Date(r.lesson.startsAt).toLocaleString('ru-RU')} · {new Date(r.createdAt).toLocaleString('ru-RU')}</div>
              </div>
              <span className={`badge ${r.status==='PENDING'?'':'badge-green'}`}>{({PENDING:'Ожидает', APPROVED:'Принято', REJECTED:'Отклонено'} as any)[r.status]}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
