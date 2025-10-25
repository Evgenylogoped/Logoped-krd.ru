import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enroll, cancel, requestActivation } from './actions'

function ActivationForm({ logopeds }: { logopeds: any[] }) {
  return (
    <form action={requestActivation} className="grid gap-3 sm:grid-cols-3">
      <div className="sm:col-span-2">
        <label className="block text-sm mb-1">Выберите логопеда</label>
        <select name="targetLogopedId" className="input !py-2 !px-2" required>
          <option value="">— Выберите —</option>
          {logopeds.map((u: any) => (
            <option key={u.id} value={u.id}>{u.name || u.email}{u.city ? ` · ${u.city}` : ''}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm mb-1">Комментарий (опционально)</label>
        <input name="note" className="input" placeholder="Коротко опишите запрос" />
      </div>
      <div className="sm:col-span-3">
        <button className="btn btn-primary">Отправить запрос на активацию</button>
      </div>
    </form>
  )
}

export default async function ParentEnrollmentsPage({ searchParams }: { searchParams: Promise<{ activationRequested?: string; conflict?: string; forbidden?: string; bookingRequested?: string }> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || role !== 'PARENT') return <div>Доступ запрещён</div>

  const userId = (session.user as any).id as string
  const parent = await (prisma as any).parent.findUnique({ where: { userId }, include: { children: true, user: true } })
  const logopeds = await (prisma as any).user.findMany({ where: { role: 'LOGOPED' }, orderBy: { name: 'asc' } })

  const now = new Date()
  const day = now.getDay() || 7
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day - 1))
  monday.setHours(0,0,0,0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23,59,59,999)

  // Показываем только будущие слоты текущей недели (начиная с текущего момента)
  const lessons = await prisma.lesson.findMany({
    where: { startsAt: { gte: now }, endsAt: { lte: sunday } },
    orderBy: { startsAt: 'asc' },
  })

  // load enrollments for the parent's children for quick status lookup
  const childIds = (parent?.children ?? []).map((c: any) => c.id)
  const enrollments = childIds.length
    ? await prisma.enrollment.findMany({ where: { childId: { in: childIds }, lessonId: { in: lessons.map(l => l.id) } } })
    : []

  const statusByChildLesson = new Map<string, string>()
  for (const e of enrollments) statusByChildLesson.set(`${e.childId}:${e.lessonId}`, e.status)

  // Этот экран показывает только доступные для самозаписи слоты. Плановые и прошедшие занятия отображаются в разделе «Занятия» у родителя.

  return (
    <div className="container space-y-6 py-6">
      <h1 className="text-3xl font-bold">Запись на занятия</h1>
      <div className="text-sm text-muted">Неделя: {monday.toLocaleDateString('ru-RU')} — {sunday.toLocaleDateString('ru-RU')}</div>

      {/* Баннер после отправки запроса */}
      {sp?.activationRequested && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800">Запрос на активацию отправлен логопеду.</div>
      )}
      {/* Баннер—заявка на запись (booking) */}
      {sp?.bookingRequested && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800">Заявка на запись отправлена логопеду. Ожидайте подтверждения.</div>
      )}
      {sp?.forbidden && (
        <div className="rounded border p-3 bg-red-50 text-red-800">Самозапись запрещена для выбранного ребёнка.</div>
      )}
      {sp?.conflict && (
        <div className="rounded border p-3 bg-red-50 text-red-800">На это время уже есть запись другого ребёнка. Пожалуйста, выберите другой слот.</div>
      )}

      {/* Архив аккаунта родителя — яркая плашка и форма запроса активации */}
      {parent?.isArchived && (
        <section className="section card-hero">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-lg font-semibold">Ваш аккаунт в архиве</div>
              <div className="text-sm">Попросите логопеда активировать аккаунт, чтобы продолжить запись на занятия.</div>
            </div>
          </div>
          <div className="mt-3">
            <ActivationForm logopeds={logopeds} />
          </div>
        </section>
      )}

      {/* Блок передачи ребенка удалён: функционал перенесён в раздел "Логопеды" */}

      {/* Секции «Запланированные» и «Прошедшие» перенесены в раздел «Занятия» у родителей. На этой странице остаются только доступные слоты для самозаписи. */}

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Доступные занятия</h2>
        {(lessons.length === 0) && (
          <div className="text-sm text-muted">На этой неделе занятий нет</div>
        )}
        {(() => {
          // Группировка уроков по логопеду
          const byLogoped = new Map<string, any[]>()
          for (const l of lessons) {
            const key = String((l as any).logopedId || 'none')
            const arr = byLogoped.get(key) || []
            arr.push(l)
            byLogoped.set(key, arr)
          }
          // Быстрый доступ к данным логопеда
          const logopedById = new Map<string, any>((logopeds as any[]).map(u => [u.id, u]))

          return Array.from(byLogoped.entries()).map(([logopedId, list]) => {
            const u = logopedId !== 'none' ? logopedById.get(logopedId) : null
            const title = u ? (u.name || u.email || 'Логопед') : 'Без логопеда'
            return (
              <div key={logopedId} className="mb-6">
                <div className="text-base font-semibold mb-2">{title}</div>
                <div className="space-y-2">
                  {list.map((l: any) => (
                    <div key={l.id} className="p-3 space-y-2 rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{l.title}</div>
                          <div className="text-sm text-muted">{new Date(l.startsAt).toLocaleString('ru-RU')} — {new Date(l.endsAt).toLocaleString('ru-RU')}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(() => {
                          const children = (parent?.children ?? []) as any[]
                          const eligible = children.filter(c => (c as any).allowSelfEnroll)
                          const anyEligible = eligible.length > 0
                          if (!anyEligible) {
                            return <div className="text-sm text-muted">Нет детей, доступных для самозаписи. Настроить разрешения можно в карточке ребёнка.</div>
                          }
                          // Показать только тех детей, кому разрешена самозапись; а если ребёнок уже записан — показать статус без кнопок
                          const shown = children.filter(ch => (ch as any).allowSelfEnroll || statusByChildLesson.get(`${ch.id}:${l.id}`) === 'ENROLLED')
                          return shown.map((ch: any) => {
                            const st = statusByChildLesson.get(`${ch.id}:${l.id}`)
                            const isEnrolled = st === 'ENROLLED'
                            const canSelfEnroll = (ch as any).allowSelfEnroll ?? false
                            return (
                              <div key={ch.id} className="flex items-center gap-2">
                                <span className={`badge ${isEnrolled ? 'badge-green' : ''}`}>{ch.lastName} {ch.firstName} {isEnrolled ? '• записан' : ''}</span>
                                {isEnrolled ? (
                                  canSelfEnroll ? (
                                    <form action={cancel}>
                                      <input type="hidden" name="childId" value={ch.id} />
                                      <input type="hidden" name="lessonId" value={l.id} />
                                      <button className="btn btn-danger text-sm">Отменить</button>
                                    </form>
                                  ) : null
                                ) : (
                                  canSelfEnroll ? (
                                    <form action={enroll}>
                                      <input type="hidden" name="childId" value={ch.id} />
                                      <input type="hidden" name="lessonId" value={l.id} />
                                      <button className="btn btn-secondary text-sm">Записать</button>
                                    </form>
                                  ) : null
                                )}
                              </div>
                            )
                          })
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        })()}
      </section>
    </div>
  )
}
