import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { enrollChildToLesson, createBooking, cancelBooking, approveConsultationRequest, rejectConsultationRequest } from './schedule/actions'

export default async function LogopedDashboard() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role)) return <div>Доступ запрещён</div>

  // Часовой пояс пользователя для корректной фильтрации "сегодня"
  const userId = (session.user as any).id as string
  const dbUser = await prisma.user.findUnique({ where: { id: userId } })
  const tz = (dbUser as any)?.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow'
  const now = new Date()
  // Старт/конец суток в часовом поясе пользователя, затем конверсия в UTC Date
  const toTZ = (d: Date, timeZone: string) => new Date(
    new Date(d).toLocaleString('en-US', { timeZone })
  )
  const tzNow = toTZ(now, tz)
  const startLocal = new Date(tzNow)
  startLocal.setHours(0,0,0,0)
  const endLocal = new Date(tzNow)
  endLocal.setHours(23,59,59,999)
  // Преобразуем локальные (в tz) границы к UTC-моментам
  const start = new Date(startLocal.getTime() - (tzNow.getTime() - now.getTime()))
  const end = new Date(endLocal.getTime() - (tzNow.getTime() - now.getTime()))

  // Делаем выборку с небольшим запасом по времени (±12ч), а затем жёстко фильтруем по дате в TZ на уровне JS
  const preFrom = new Date(start.getTime() - 12*60*60*1000)
  const preTo = new Date(end.getTime() + 12*60*60*1000)
  const rawLessons = await (prisma as any).lesson.findMany({
    where: { startsAt: { gte: preFrom, lte: preTo }, logopedId: userId },
    orderBy: { startsAt: 'asc' },
    include: { 
      enrolls: { include: { child: { include: { parent: { include: { user: true } } } } } },
      bookings: true,
      consultationRequests: true,
    },
  }) as any[]

  // Автоочистка просроченных PENDING-заявок консультаций (для текущего логопеда)
  try {
    const expired = await (prisma as any).consultationRequest.findMany({
      where: { subordinateId: userId, status: 'PENDING', lesson: { endsAt: { lt: now } } },
      select: { id: true },
      take: 100,
    })
    if (expired.length > 0) {
      for (const r of expired) {
        await (prisma as any).consultationRequest.update({ where: { id: r.id }, data: { status: 'REJECTED', respondedAt: new Date() } })
      }
    }
  } catch {}

  // Оценки по выбранным урокам (для фильтрации и подсчёта напоминаний)
  const allLessonIds = rawLessons.map(l => l.id)
  const allEvals = allLessonIds.length ? await (prisma as any).lessonEvaluation.findMany({ where: { lessonId: { in: allLessonIds } } }) : []
  const evalByLesson: Record<string, 'DONE' | 'CANCELLED' | 'DRAFT' | 'PENDING' | undefined> = {}
  for (const ev of allEvals) {
    // Считаем урок оценённым, если есть DONE или CANCELLED
    const st = (ev as any).status as string | undefined
    if (!st) continue
    if (st === 'DONE' || st === 'CANCELLED') evalByLesson[(ev as any).lessonId] = st as any
  }

  const fmt = new Intl.DateTimeFormat('ru-RU', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  const todayKey = fmt.format(tzNow)
  const todaysLessons = rawLessons.filter((l: any) => {
    const k1 = fmt.format(new Date(l.startsAt))
    const k2 = fmt.format(new Date(l.endsAt ?? l.startsAt))
    return k1 === todayKey && k2 === todayKey
  })

  // Фильтрация по рабочему времени (WorkTemplate) для текущего дня недели пользователя
  const dow = (() => { const d = tzNow.getDay(); return d === 0 ? 7 : d })() // 1..7, Пн..Вс
  const templates = (await ((prisma as any).workTemplate?.findMany
    ? (prisma as any).workTemplate.findMany({ where: { userId: userId, dayOfWeek: dow } })
    : Promise.resolve([]))) as any[]
  const intervals = templates.map(t => ({ start: t.startMinutes, end: t.endMinutes })).filter(it => typeof it.start === 'number' && typeof it.end === 'number' && it.end > it.start)
  const timeInMinutesTZ = (dateUtc: string | Date) => {
    const local = toTZ(new Date(dateUtc), tz)
    return local.getHours()*60 + local.getMinutes()
  }
  const inWorkingTime = (dateStartUtc: any, dateEndUtc: any) => {
    if (intervals.length === 0) return true // если шаблонов нет — не режем
    const s = timeInMinutesTZ(dateStartUtc)
    const e = timeInMinutesTZ(dateEndUtc)
    return intervals.some(iv => s >= iv.start && e <= iv.end)
  }
  const todaysLessonsInWorkTime = todaysLessons.filter((l: any) => inWorkingTime(l.startsAt, l.endsAt ?? l.startsAt))
  // Скрываем из сегодняшнего списка уже оценённые уроки (DONE/CANCELLED)
  const todaysLessonsPending = todaysLessonsInWorkTime.filter((l: any) => !evalByLesson[l.id])

  // Напоминание о неоценённых прошедших занятиях (за последние 14 дней)
  const pastFrom = new Date(now.getTime() - 14*24*60*60*1000)
  const pastLessonsAll = await (prisma as any).lesson.findMany({
    where: {
      logopedId: userId,
      startsAt: { gte: pastFrom, lt: now },
    },
    select: { id: true },
    take: 500,
  })
  const pastIds = pastLessonsAll.map((l:any)=> l.id)
  const pastEvals = pastIds.length ? await (prisma as any).lessonEvaluation.findMany({ where: { lessonId: { in: pastIds } }, select: { lessonId: true, status: true } }) : []
  const evaluatedPast = new Set<string>()
  for (const ev of pastEvals) {
    const st = (ev as any).status
    if (st === 'DONE' || st === 'CANCELLED') evaluatedPast.add((ev as any).lessonId)
  }
  const pastUnevaluatedCount = pastIds.filter((id:string) => !evaluatedPast.has(id)).length

  // дети текущего логопеда для записи в свободный слот
  const children = await (prisma as any).child.findMany({ where: { logopedId: userId, isArchived: false }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] })
  // Счетчики для панели задач
  const countConsultIn = await (prisma as any).consultationRequest.count({ where: { subordinateId: userId, status: 'PENDING' } })
  const countConsultOut = await (prisma as any).consultationRequest.count({ where: { supervisorId: userId, status: 'PENDING' } })
  const countParentActiv = await (prisma as any).activationRequest.count({ where: { targetLogopedId: userId, status: 'PENDING' } })

  const name = (session.user as any)?.name || (session.user as any)?.email
  const userEmail = (session.user as any)?.email as string
  const betaLeftDays = (() => {
    const u: any = dbUser
    if (!u) return 0
    const nowTs = Date.now()
    const actForever = !!u.activatedForever
    const actUntil = u.activatedUntil ? new Date(u.activatedUntil).getTime() : 0
    if (actForever || actUntil > nowTs) return 0
    const beta = u.betaExpiresAt ? new Date(u.betaExpiresAt).getTime() : 0
    if (beta <= nowTs) return -1
    return Math.ceil((beta - nowTs) / (1000*60*60*24))
  })()

  // Уведомления о передачах детей
  const lastSeen = (dbUser as any)?.lastNotificationsSeenAt ? new Date((dbUser as any).lastNotificationsSeenAt as any) : new Date(0)
  const transferApprovedSince = await (async () => {
    try {
      return await (prisma as any).transferRequest.count({ where: { toLogopedId: userId, status: 'APPROVED', createdAt: { gt: lastSeen } } })
    } catch { return 0 }
  })()
  const transferPendingCount = await (async () => {
    try {
      return await (prisma as any).transferRequest.count({ where: { toLogopedId: userId, status: 'PENDING' } })
    } catch { return 0 }
  })()

  return (
    <div className="container space-y-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Здравствуйте, {name}</h1>
      </div>
      {/* Баннер о принятых передачах с последнего просмотра уведомлений */}
      {transferApprovedSince > 0 && (
        <a href="/logoped/notifications" className="rounded border p-3 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 transition flex items-center justify-between">
          <div>Вам переданы новые дети: {transferApprovedSince}. Проверьте уведомления.</div>
          <div className="btn btn-secondary btn-sm">Перейти</div>
        </a>
      )}
      {/* Напоминание про неоценённые прошедшие занятия */}
      {pastUnevaluatedCount > 0 && (
        <a href="/logoped/schedule" className="rounded border p-3 bg-amber-50 text-amber-900 hover:bg-amber-100 transition flex items-center justify-between">
          <div>
            У вас {pastUnevaluatedCount} неоценённых прошедших занятий (за 14 дней, включая сегодня). Пожалуйста, оцените их в расписании.
          </div>
          <div className="btn btn-secondary btn-sm">Перейти в расписание</div>
        </a>
      )}

      <div className="text-sm text-muted">Сегодня: {tzNow.toLocaleDateString('ru-RU', { timeZone: tz })}</div>

      {/* Панель задач */}
      <div className="grid gap-3 sm:grid-cols-4">
        <a href="/logoped/notifications" className="rounded border p-3 hover:bg-gray-50 transition">
          <div className="text-sm text-muted">Входящие консультации</div>
          <div className="mt-1 text-2xl font-bold">{countConsultIn}</div>
        </a>
        <a href="/logoped/schedule" className="rounded border p-3 hover:bg-gray-50 transition">
          <div className="text-sm text-muted">Исходящие консультации</div>
          <div className="mt-1 text-2xl font-bold">{countConsultOut}</div>
        </a>
        <a href="/logoped/notifications#parent-activations" className="rounded border p-3 hover:bg-gray-50 transition">
          <div className="text-sm text-muted">Заявки активации родителей</div>
          <div className="mt-1 text-2xl font-bold">{countParentActiv}</div>
        </a>
        <a href="/logoped/notifications" className="rounded border p-3 hover:bg-gray-50 transition">
          <div className="text-sm text-muted">Передачи детей</div>
          <div className="mt-1 text-sm text-muted">Перейти к уведомлениям</div>
        </a>
      </div>

      {betaLeftDays !== 0 && (
        <div className={`rounded border p-3 ${betaLeftDays>0?'bg-indigo-50 text-indigo-900':'bg-amber-50 text-amber-900'}`}>
          {betaLeftDays>0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                Бета-аккаунт активен. Осталось {betaLeftDays} дн.
              </div>
              <a
                href={`https://wa.me/89889543377?text=${encodeURIComponent('Здравствуйте! Хочу оплатить подписку. Мой email: ' + (userEmail||''))}`}
                target="_blank"
                className="btn btn-primary btn-sm"
              >Связаться для оплаты</a>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>Срок бета-аккаунта истёк.</div>
              <a
                href={`https://wa.me/89889543377?text=${encodeURIComponent('Здравствуйте! Хочу продлить/оплатить подписку. Мой email: ' + (userEmail||''))}`}
                target="_blank"
                className="btn btn-primary btn-sm"
              >Связаться для оплаты</a>
            </div>
          )}
        </div>
      )}

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Занятия на сегодня</h2>
        <div className="space-y-2">
          {todaysLessonsInWorkTime.length === 0 && <div className="text-sm text-muted">На сегодня занятий нет</div>}
          {todaysLessonsInWorkTime.map((l: any) => {
            const t1 = new Date(l.startsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: tz })
            const t2 = new Date(l.endsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: tz })
            const enr = (l.enrolls || []) as any[]
            const enrolled = enr[0]
            const child = enrolled?.child
            const parent = child?.parent
            const parentName = parent?.fullName || parent?.user?.name || parent?.user?.email || '—'
            const parentPhone = parent?.phone || '—'
            const childName = child ? `${child.lastName} ${child.firstName}` : (l.bookings?.[0]?.holder ? `Бронь: ${l.bookings[0].holder}` : 'Свободно')
            const hasActiveBooking = (l.bookings || []).some((b: any) => b.status === 'ACTIVE')
            const pendingConsult = (l.consultationRequests || []).find((c: any) => c.status === 'PENDING')
            const isPast = new Date(l.endsAt) < now
            const isEvaluated = Boolean(evalByLesson[l.id])
            const showPendingConsult = Boolean(pendingConsult && !isPast && !enrolled && !hasActiveBooking && !isEvaluated)
            return (
              <div key={l.id} className={`p-3 rounded-md border shadow-sm ${showPendingConsult ? 'slot-pending-subordinate' : ''}`} style={{ background: 'var(--card-bg)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold">
                      {t1} — {t2}
                      {showPendingConsult && (
                        <span className="ml-2 inline-flex items-center text-xs font-medium text-indigo-700"><span className="i-circle pulse mr-1"/> Запрос консультации</span>
                      )}
                    </div>
                    <div className="text-sm text-muted">Ребёнок: {childName}</div>
                    {child && (
                      <div className="text-xs text-muted flex flex-wrap items-center gap-2">Родитель: {parentName} · Телефон: {parentPhone}
                        {(() => {
                          const raw = String(parentPhone || '')
                          const digits = raw.replace(/\D/g, '')
                          if (!digits) return null
                          const plus = raw.trim().startsWith('+') ? '+' : ''
                          const telHref = `tel:${plus}${digits}`
                          const waHref = `https://wa.me/${digits}`
                          const maxHref = `max://chat?phone=${digits}`
                          return (
                            <span className="inline-flex items-center gap-1 ml-2">
                              <a href={telHref} className="btn btn-outline btn-sm" title="Позвонить">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.08 4.18 2 2 0 0 1 4.06 2h3a2 2 0 0 1 2 1.72 12.66 12.66 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.66 12.66 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>
                              </a>
                              <a href={waHref} target="_blank" className="btn btn-outline btn-sm" title="WhatsApp">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.472-.149-.67.15-.198.297-.767.966-.94 1.165-.173.198-.347.223-.644.074-.297-.148-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.654-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.373-.025-.522-.075-.149-.669-1.613-.916-2.206-.242-.58-.487-.5-.669-.51l-.57-.01c-.198 0-.521.074-.793.372-.272.298-1.041 1.016-1.041 2.479 0 1.462 1.066 2.875 1.213 3.074.149.198 2.1 3.2 5.083 4.487.71.306 1.263.489 1.694.626.712.227 1.36.195 1.872.118.571-.085 1.758-.718 2.006-1.41.248-.69.248-1.282.173-1.41-.074-.124-.272-.198-.57-.347z"/><path d="M20.52 3.48A11.94 11.94 0 0 0 12 0C5.373 0 0 5.373 0 12c0 2.114.553 4.096 1.52 5.82L0 24l6.38-1.48A11.94 11.94 0 0 0 12 24c6.627 0 12-5.373 12-12 0-3.19-1.242-6.096-3.48-8.52zM12 22a9.93 9.93 0 0 1-5.062-1.387l-.363-.215-3.778.88.805-3.687-.23-.378A9.94 9.94 0 1 1 12 22z"/></svg>
                              </a>
                              <a href={maxHref} className="btn btn-outline btn-sm" title="Max">
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 5h18v14H3z"/><path d="M3 5l9 7 9-7"/></svg>
                              </a>
                            </span>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {child && (
                      <>
                        <Link href={`/logoped/child/${child.id}`} className="btn btn-secondary btn-sm">Карточка</Link>
                        {/* Оценка доступна только для прошедших и неоценённых уроков */}
                        {isPast && !isEvaluated ? (
                          <Link href={`/logoped/lesson/${l.id}`} className="btn btn-outline btn-sm">Оценить</Link>
                        ) : null}
                        {isPast && isEvaluated ? (
                          <span className="badge badge-green">Оценено</span>
                        ) : null}
                      </>
                    )}
                    {!child && hasActiveBooking && (
                      <>
                        <Link href={`/logoped/lesson/${l.id}`} className="btn btn-outline btn-sm">Слот</Link>
                        {/* Кнопка отмены брони первой активной */}
                        {(() => {
                          const b = (l.bookings || []).find((x: any) => x.status === 'ACTIVE')
                          return b ? (
                            <form action={cancelBooking}>
                              <input type="hidden" name="bookingId" value={b.id} />
                              <button className="btn btn-danger btn-sm">Отменить бронь</button>
                            </form>
                          ) : null
                        })()}
                      </>
                    )}
                    {!child && !hasActiveBooking && showPendingConsult && (
                      <>
                        <form action={approveConsultationRequest}>
                          <input type="hidden" name="requestId" value={pendingConsult.id} />
                          <button className="btn btn-secondary btn-sm">Принять</button>
                        </form>
                        <form action={rejectConsultationRequest}>
                          <input type="hidden" name="requestId" value={pendingConsult.id} />
                          <button className="btn btn-danger btn-sm">Отклонить</button>
                        </form>
                      </>
                    )}
                    {!child && !hasActiveBooking && !pendingConsult && (
                      <>
                        <form action={enrollChildToLesson} className="flex items-center gap-2">
                          <input type="hidden" name="lessonId" value={l.id} />
                          <select name="childId" className="input">
                            {children.map((c: any) => (
                              <option value={c.id} key={c.id}>{c.lastName} {c.firstName}</option>
                            ))}
                          </select>
                          <button className="btn btn-secondary btn-sm">Записать</button>
                        </form>
                        <form action={createBooking} className="flex items-center gap-2">
                          <input type="hidden" name="lessonId" value={l.id} />
                          <input className="input" name="holder" placeholder="Имя для брони" />
                          <button className="btn btn-outline btn-sm">Бронь</button>
                        </form>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
