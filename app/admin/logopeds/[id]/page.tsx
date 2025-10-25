import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import VipBadge from '@/components/VipBadge'

export default async function AdminLogopedViewPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<Record<string, string | string[]>> }) {
  const { id } = await params
  const sp = (searchParams ? await searchParams : {}) as Record<string, string | string[]>
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>
  const user = await prisma.user.findUnique({ where: { id }, include: { branch: { include: { company: true } } } })
  if (!user || user.role !== 'LOGOPED') return <div className="container py-6">Логопед не найден</div>

  // Дети логопеда
  const children = await prisma.child.findMany({ where: { logopedId: id }, include: { parent: { include: { user: true } } }, orderBy: { id: 'desc' } })
  // Ближайшие занятия
  const now = new Date()
  const upcoming = await prisma.lesson.findMany({ where: { logopedId: id, startsAt: { gte: now } }, include: { group: { include: { branch: true } } }, orderBy: { startsAt: 'asc' }, take: 20 })
  // Переписка (чаты) с пагинацией
  const convPage = Math.max(1, Number(((sp?.convPage ?? '1') as any)) || 1)
  const convTake = 20 * convPage
  const convParts = await prisma.conversationParticipant.findMany({
    where: { userId: id },
    include: {
      conversation: {
        include: {
          messages: { include: { author: true }, orderBy: { createdAt: 'desc' }, take: 50 },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
    take: convTake,
  })

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Профиль логопеда</h1>
        <Link href="/admin/logopeds" className="btn">Назад</Link>
      </div>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded border p-4 space-y-2">
          <h2 className="font-semibold text-lg">Основное</h2>
          <div className="flex items-center gap-2 flex-wrap"><span className="text-muted">Имя:</span> <span className="font-medium">{user.name || '—'}</span> {(((user as any).featuredSuper) || ((user as any).featured)) && (
            <VipBadge level={(user as any).featuredSuper ? 'VIP+' : 'VIP'} />
          )}</div>
          <div><span className="text-muted">Email:</span> {user.email}</div>
          <div><span className="text-muted">Город:</span> {(user as any).city || '—'}</div>
          <div><span className="text-muted">Профессия:</span> {(user as any).profession || '—'}</div>
          <div><span className="text-muted">Специализация:</span> {(user as any).specialization || '—'}</div>
          <div><span className="text-muted">О себе:</span> {(user as any).about || '—'}</div>
          <div><span className="text-muted">Образование:</span> {(user as any).education || '—'}</div>
          <div><span className="text-muted">Адрес:</span> {(user as any).address || '—'}</div>
        </div>
        <div className="rounded border p-4 space-y-2">
          <h2 className="font-semibold text-lg">Параметры работы</h2>
          <div><span className="text-muted">Стаж:</span> {(user as any).experienceYears ?? '—'}</div>
          <div><span className="text-muted">Цена занятия:</span> {(user as any).lessonPrice ?? '—'}</div>
          <div><span className="text-muted">Показывать цену родителям:</span> {(user as any).showPriceToParents ? 'Да' : 'Нет'}</div>
          <div><span className="text-muted">Онлайн:</span> {(user as any).isOnline ? 'Да' : 'Нет'}</div>
          <div><span className="text-muted">Офлайн:</span> {(user as any).isOffline ? 'Да' : 'Нет'}</div>
          <div><span className="text-muted">Слот (мин):</span> {(user as any).scheduleSlotMinutes ?? '—'}</div>
          <div><span className="text-muted">Перерыв (мин):</span> {(user as any).scheduleBreakMinutes ?? '—'}</div>
          <div><span className="text-muted">Часовой пояс:</span> {(user as any).timeZone || '—'}</div>
          <div><span className="text-muted">Расписание:</span> {(user as any).preferredScheduleView || '—'}</div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded border p-4 space-y-2">
          <h2 className="font-semibold text-lg">Аккаунт и оповещения</h2>
          <div><span className="text-muted">Письма:</span> {user.notifyByEmail ? 'Включены' : 'Выключены'}</div>
          <div><span className="text-muted">Валюта:</span> {(user as any).currency || '—'}</div>
          <div><span className="text-muted">Отчётный период:</span> {(user as any).reportPeriod || '—'}</div>
          <div><span className="text-muted">Скрыть Образование:</span> {(user as any).hideEducationFromParents ? 'Да' : 'Нет'}</div>
          <div><span className="text-muted">Скрыть О себе:</span> {(user as any).hideAboutFromParents ? 'Да' : 'Нет'}</div>
        </div>
        <div className="rounded border p-4 space-y-2">
          <h2 className="font-semibold text-lg">Активация и организация</h2>
          <div><span className="text-muted">Активирован навсегда:</span> {user.activatedForever ? 'Да' : 'Нет'}</div>
          <div><span className="text-muted">Активен до:</span> {user.activatedUntil ? new Date(user.activatedUntil).toLocaleDateString('ru-RU') : '—'}</div>
          <div><span className="text-muted">Филиал:</span> {user.branch ? `${user.branch.name} (${user.branch.company.name})` : '—'}</div>
        </div>
      </section>

      <section className="rounded border p-4">
        <h2 className="font-semibold text-lg mb-2">Дети и ближайшие занятия</h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="font-medium mb-2">Дети ({children.length})</div>
            <div className="space-y-2">
              {children.length === 0 && <div className="text-sm text-muted">Нет детей</div>}
              {children.map((ch:any) => (
                <div key={ch.id} className="p-3 text-sm rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                  <div className="font-medium">{ch.lastName} {ch.firstName}</div>
                  <div className="text-muted">Родитель: {ch.parent?.user?.name || ch.parent?.user?.email}</div>
                  <Link href={`/logoped/child/${ch.id}`} target="_blank" className="link">Открыть карточку →</Link>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="font-medium mb-2">Ближайшие занятия</div>
            <div className="space-y-2">
              {upcoming.length === 0 && <div className="text-sm text-muted">Нет ближайших занятий</div>}
              {upcoming.map((l:any) => (
                <div key={l.id} className="p-3 text-sm rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                  <div className="font-medium">{new Date(l.startsAt).toLocaleString('ru-RU')} — {new Date(l.endsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</div>
                  <div className="text-muted">Группа: {l.group?.name || '—'} · Филиал: {l.group?.branch?.name || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded border p-4">
        <h2 className="font-semibold text-lg mb-2">Переписка (последние сообщения)</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {convParts.length === 0 && <div className="text-sm text-muted">Нет переписки</div>}
          {convParts.map((cp:any) => (
            <div key={cp.conversation.id} className="rounded border p-3">
              <div className="font-medium mb-2">Диалог #{cp.conversation.id.slice(-6)}</div>
              <div className="space-y-2 max-h-64 overflow-auto">
                {cp.conversation.messages.length === 0 && <div className="text-sm text-muted">Сообщений нет</div>}
                {cp.conversation.messages.map((m:any) => (
                  <div key={m.id} className="text-sm">
                    <div className="text-muted">{new Date(m.createdAt).toLocaleString('ru-RU')} · {m.author?.name || m.author?.email}</div>
                    <div>{m.body}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <a href={`/chat/${cp.conversation.id}`} className="btn btn-outline btn-sm" target="_blank" rel="noreferrer">Открыть диалог</a>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <a href={`?convPage=${convPage+1}`} className="btn btn-sm">Показать ещё</a>
        </div>
      </section>
    </div>
  )
}
