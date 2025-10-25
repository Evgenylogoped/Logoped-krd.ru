import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { addTemplateInterval, deleteTemplateInterval, applyTemplateToWeek, updateScheduleSettings, addBlockedTime, deleteBlockedTime } from '../../../(dash)/logoped/schedule/actions'

export const revalidate = 0

export default async function SettingsScheduleTemplatePage({ searchParams }: { searchParams?: Promise<{ saved?: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','LOGOPED'].includes(role)) return <div className="py-6">Доступ запрещён</div>
  const userId = (session.user as any).id as string

  const [dbUser, templates, blocked] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.workTemplate.findMany({ where: { userId }, orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }] }),
    prisma.blockedTime.findMany({ where: { userId }, orderBy: { startsAt: 'asc' } }),
  ])

  const slotMin = (dbUser as any)?.scheduleSlotMinutes || 30
  const breakMin = (dbUser as any)?.scheduleBreakMinutes || 0
  const preferred = (dbUser as any)?.preferredScheduleView || 'week'

  const sp = (searchParams ? await searchParams : {}) as { saved?: string }
  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-bold">Шаблон недели</h1>
      {sp?.saved === '1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Изменения сохранены</div>
      )}

      {/* Общие настройки расписания */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Общие настройки расписания</h2>
        <form action={updateScheduleSettings} className="grid gap-4">
          <label className="grid gap-1">
            <span className="text-sm text-muted">Длительность слота (мин)</span>
            <input name="scheduleSlotMinutes" defaultValue={slotMin} type="number" min={5} step={5} className="input w-36" />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-muted">Перерыв между слотами (мин)</span>
            <input name="scheduleBreakMinutes" defaultValue={breakMin} type="number" min={0} step={5} className="input w-36" />
          </label>
          <div className="grid gap-1">
            <span className="text-sm text-muted">Предпочитаемый вид расписания</span>
            <div className="flex items-center gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="preferredScheduleView" value="week" defaultChecked={preferred==='week'} /> Неделя
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="preferredScheduleView" value="month" defaultChecked={preferred==='month'} /> Месяц
              </label>
            </div>
          </div>
          <button className="btn w-fit">Сохранить</button>
        </form>
      </section>

      {/* Интервалы шаблона */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Интервалы шаблона</h2>
        <form action={addTemplateInterval} className="grid gap-3 sm:grid-cols-5">
          <select name="dayOfWeek" className="input !py-2 !px-2" required>
            <option value="1">Пн</option>
            <option value="2">Вт</option>
            <option value="3">Ср</option>
            <option value="4">Чт</option>
            <option value="5">Пт</option>
            <option value="6">Сб</option>
            <option value="7">Вс</option>
          </select>
          <input name="start" type="time" className="input" required />
          <input name="end" type="time" className="input" required />
          <div className="sm:col-span-2"><button className="btn btn-primary w-full sm:w-auto">Добавить интервал</button></div>
        </form>
        <div className="space-y-2">
          {templates.length === 0 && <div className="text-sm text-muted">Интервалов нет</div>}
          {templates.map(t => (
            <div key={t.id} className="flex items-center justify-between p-3 rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
              <div className="text-sm">
                День: {['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][t.dayOfWeek-1]} · {String(Math.floor(t.startMinutes/60)).padStart(2,'0')}:{String(t.startMinutes%60).padStart(2,'0')} — {String(Math.floor(t.endMinutes/60)).padStart(2,'0')}:{String(t.endMinutes%60).padStart(2,'0')}
              </div>
              <form action={deleteTemplateInterval}>
                <input type="hidden" name="id" value={t.id} />
                <button className="btn btn-danger text-sm">Удалить</button>
              </form>
            </div>
          ))}
        </div>
      </section>

      {/* Применение шаблона */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Применить шаблон к неделе</h2>
        <form action={applyTemplateToWeek} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="text-sm">Неделя начинается с</label>
          <input name="weekStart" type="date" className="input w-auto" required />
          <button className="btn">Сгенерировать занятия</button>
        </form>
      </section>

      {/* Блокировки времени */}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Блокировки времени</h2>
        <form action={addBlockedTime} className="grid gap-3 sm:grid-cols-5">
          <input name="startsAt" type="datetime-local" className="input" required />
          <input name="endsAt" type="datetime-local" className="input" required />
          <button className="btn btn-primary">Заблокировать</button>
        </form>
        <div className="space-y-2">
          {blocked.length === 0 && <div className="text-sm text-muted">Нет блокировок</div>}
          {blocked.map(b => (
            <div key={b.id} className="flex items-center justify-between p-3 rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
              <div className="text-sm">
                {new Date(b.startsAt).toLocaleString('ru-RU')} — {new Date(b.endsAt).toLocaleString('ru-RU')} {b.reason ? `· ${b.reason}` : ''}
              </div>
              <form action={deleteBlockedTime}>
                <input type="hidden" name="id" value={b.id} />
              </form>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
