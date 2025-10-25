import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { updateUserSettings, addSubordinate, removeSubordinate, addSupervisor, removeSupervisor } from './actions'
import { prisma } from '@/lib/prisma'

export default async function SettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return <div>Доступ запрещён</div>
  const user = session.user as any
  const selfId = (user as any).id as string
  const dbUser = await prisma.user.findUnique({ where: { id: selfId } })
  const subs = await (prisma as any).userSupervisor.findMany({ where: { supervisorId: selfId }, include: { subordinate: true } })
  const supers = await (prisma as any).userSupervisor.findMany({ where: { subordinateId: selfId }, include: { supervisor: true } })
  const logopeds = await (prisma as any).user.findMany({ where: { role: 'LOGOPED', id: { not: selfId } }, orderBy: { name: 'asc' } })

  const now = new Date()
  const activatedForever = !!(dbUser as any)?.activatedForever
  const activatedUntil = (dbUser as any)?.activatedUntil ? new Date((dbUser as any).activatedUntil as any) : null
  const betaExpiresAt = (dbUser as any)?.betaExpiresAt ? new Date((dbUser as any).betaExpiresAt as any) : null
  const activeByPaid = activatedForever || (activatedUntil && activatedUntil > now)
  const paidLeftDays = !activatedForever && activatedUntil && activatedUntil > now ? Math.ceil((activatedUntil.getTime() - now.getTime()) / (1000*60*60*24)) : 0
  const betaLeftDays = !activeByPaid && betaExpiresAt ? Math.ceil((betaExpiresAt.getTime() - now.getTime()) / (1000*60*60*24)) : 0

  return (
    <div className="container space-y-6 py-6">
      <h1 className="text-3xl font-bold">Настройки</h1>
      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Общее</h2>
        <form action={updateUserSettings} className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="block text-sm mb-1">Вид расписания по умолчанию</label>
            <select name="preferredScheduleView" defaultValue={user.preferredScheduleView || ''} className="input !py-2 !px-2">
              <option value="">—</option>
              <option value="week">Неделя</option>
              <option value="month">Месяц</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1">Часовой пояс</label>
            <input name="timeZone" defaultValue={user.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone} className="input" />
          </div>
          <div className="sm:col-span-3">
            <button className="btn btn-primary">Сохранить</button>
          </div>
        </form>
      </section>

      {(user.role === 'LOGOPED' || user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') && (
        <section className="section">
          <h2 className="mb-3 text-lg font-semibold">Подписка</h2>
          <div className="rounded border p-3" style={{ background: 'var(--card-bg)' }}>
            {activatedForever ? (
              <div className="text-sm text-emerald-800">Подписка активирована навсегда.</div>
            ) : activeByPaid ? (
              <div className="text-sm">Оплачено до: <span className="font-medium">{activatedUntil?.toLocaleDateString('ru-RU')}</span> ({paidLeftDays} дн. осталось)</div>
            ) : betaLeftDays > 0 ? (
              <div className="text-sm">Бета-аккаунт активен. Осталось <span className="font-medium">{betaLeftDays}</span> дн.</div>
            ) : (
              <div className="text-sm text-amber-800">Подписка не активна. Бета истекла.</div>
            )}
            <div className="mt-3">
              <a
                href={`https://wa.me/89889543377?text=${encodeURIComponent('Здравствуйте! Хочу оплатить/продлить подписку. Мой email: ' + (user.email||''))}`}
                target="_blank"
                className="btn btn-primary btn-sm"
              >Связаться для оплаты</a>
            </div>
          </div>
        </section>
      )}

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Руководитель → Подчинённый</h2>
        <div className="mb-3">
          <div className="text-sm text-muted mb-1">Мои подчинённые</div>
          <ul className="space-y-2">
            {subs.length === 0 && <li className="text-sm text-muted py-2">Нет подчинённых</li>}
            {subs.map((r: any) => (
              <li key={r.subordinateId} className="p-3 flex items-center justify-between text-sm rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                <div>{r.subordinate.name || r.subordinate.email}</div>
                <form action={removeSubordinate}>
                  <input type="hidden" name="subordinateId" value={r.subordinateId} />
                  <button className="btn btn-danger btn-sm">Удалить</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-2 sm:grid-cols-4 items-end">
          <div className="sm:col-span-3">
            <label className="block text-sm mb-1">Добавить подчинённого</label>
            <select name="subordinateId" form="add-sub-form" className="input !py-2 !px-2">
              {logopeds.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
          </div>
          <form id="add-sub-form" action={addSubordinate}>
            <button className="btn btn-primary">Добавить</button>
          </form>
        </div>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Мои руководители</h2>
        <div className="mb-3">
          <div className="text-sm text-muted mb-1">Список руководителей</div>
          <ul className="space-y-2">
            {supers.length === 0 && <li className="text-sm text-muted py-2">Нет руководителей</li>}
            {supers.map((r: any) => (
              <li key={r.supervisorId} className="p-3 flex items-center justify-between text-sm rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                <div>{r.supervisor.name || r.supervisor.email}</div>
                <form action={removeSupervisor}>
                  <input type="hidden" name="supervisorId" value={r.supervisorId} />
                  <button className="btn btn-danger btn-sm">Удалить</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-2 sm:grid-cols-4 items-end">
          <div className="sm:col-span-3">
            <label className="block text-sm mb-1">Добавить руководителя</label>
            <select name="supervisorId" form="add-sup-form" className="input !py-2 !px-2">
              {logopeds.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
          </div>
          <form id="add-sup-form" action={addSupervisor}>
            <button className="btn btn-primary">Добавить</button>
          </form>
        </div>
      </section>
    </div>
  )
}
