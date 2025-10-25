import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { addTemplateInterval, deleteTemplateInterval, applyTemplateToWeek, addBlockedTime, deleteBlockedTime, updateScheduleSettings, enrollChildToLesson, createBooking, cancelBooking, cancelEnrollment, generateSlotsNext4Weeks, extendSlots4Weeks, createConsultationRequest, approveConsultationRequest, rejectConsultationRequest, approveParentBooking, rejectParentBooking } from './actions'
import Link from 'next/link'
import { markLessonCancelled } from '../lesson/[id]/actions'

export default async function LogopedSchedulePage({ searchParams }: { searchParams: Promise<{ view?: string; weekOffset?: string; monthOffset?: string; viewUserId?: string; consult?: string }> }) {
  const sp = await searchParams
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','LOGOPED'].includes(role)) return <div>Доступ запрещён</div>

  const now = new Date()
  const day = now.getDay() || 7 // Monday=1..Sunday=7
  const offset = Number(sp.weekOffset || '0') || 0
  const monday = new Date(now)
  monday.setDate(now.getDate() - (day - 1))
  if (offset) monday.setDate(monday.getDate() + offset * 7)
  monday.setHours(0,0,0,0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23,59,59,999)

  // try to use user settings if view not provided
  const session2 = await getServerSession(authOptions)
  const user = session2?.user as any
  const selfId = (user as any)?.id as string
  // список подчинённых для режима руководителя
  // Новая логика: руководитель организации видит всех логопедов своей компании; руководитель филиала — логопедов своего филиала.
  // Старую схему через UserSupervisor используем как fallback, если нет роли руководителя.
  const meFull = await prisma.user.findUnique({ where: { id: selfId }, include: { branch: { include: { company: true } } } }) as any
  const isOrgLeader = Boolean(meFull?.branch?.company?.ownerId === selfId)
  const isBranchManager = Boolean(meFull?.branch?.managerId === selfId)
  let subs: any[] = []
  if (isOrgLeader && meFull?.branch?.companyId) {
    const users = await prisma.user.findMany({ where: { role: 'LOGOPED', branch: { companyId: meFull.branch.companyId } }, orderBy: { name: 'asc' } })
    subs = users.filter(u => u.id !== selfId).map(u => ({ subordinateId: u.id, subordinate: u }))
  } else if (isBranchManager && meFull?.branchId) {
    const users = await prisma.user.findMany({ where: { role: 'LOGOPED', branchId: meFull.branchId }, orderBy: { name: 'asc' } })
    subs = users.filter(u => u.id !== selfId).map(u => ({ subordinateId: u.id, subordinate: u }))
  } else {
    subs = await (prisma as any).userSupervisor.findMany({ where: { supervisorId: selfId }, include: { subordinate: true } })
  }
  const targetUserId = (sp?.viewUserId && subs.some((r: any) => (r.subordinateId || r.subordinate?.id) === sp.viewUserId)) ? sp.viewUserId! : selfId
  const isSupervisorMode = targetUserId !== selfId
  const preferred = (user as any)?.preferredScheduleView as 'week'|'month' | undefined
  const view = (sp?.view || preferred || 'week') as 'week'|'month'
  const consultState = sp?.consult as string | undefined

  // Загружаем пользователя из БД, чтобы брать сохранённые настройки слотов/перерывов
  const dbUser = await prisma.user.findUnique({ where: { id: targetUserId } })

  // Авто‑очистка: удаляем прошедшие пустые уроки (без записей и броней) текущего логопеда
  await (prisma as any).lesson.deleteMany({
    where: {
      logopedId: (user as any)?.id,
      endsAt: { lt: new Date() },
      enrolls: { none: {} },
      bookings: { none: {} },
    }
  })

  // For week view
  const lessons = (await (prisma as any).lesson.findMany({
    where: { startsAt: { gte: monday }, endsAt: { lte: sunday }, logopedId: targetUserId },
    orderBy: { startsAt: 'asc' },
    include: { enrolls: { include: { child: true } }, bookings: true, evaluations: true, consultationRequests: true },
  })) as any[]

  // Автоочистка просроченных PENDING-заявок консультаций для выбранного пользователя расписания
  try {
    await (prisma as any).consultationRequest.updateMany({
      where: { subordinateId: targetUserId, status: 'PENDING', lesson: { endsAt: { lt: new Date() } } },
      data: { status: 'REJECTED', respondedAt: new Date() },
    })
  } catch {}

  // Автоотмена просроченных бронирований (booking), если урок уже закончился
  try {
    await (prisma as any).booking.updateMany({
      where: { status: 'ACTIVE', lesson: { logopedId: targetUserId, endsAt: { lt: new Date() } } },
      data: { status: 'CANCELLED', liquidatedAt: new Date() },
    })
  } catch {}

  // Horizon: найти дату последнего слота для текущего логопеда
  const latestLesson = await (prisma as any).lesson.findFirst({ where: { logopedId: targetUserId }, orderBy: { endsAt: 'desc' } })
  const latestEnd = latestLesson ? new Date(latestLesson.endsAt) : null
  const daysLeft = latestEnd ? Math.ceil((latestEnd.getTime() - now.getTime()) / (1000*60*60*24)) : 0

  // For month view
  const mOff = Number(sp.monthOffset || '0') || 0
  const baseMonth = new Date(now.getFullYear(), now.getMonth() + mOff, 1)
  const firstDayMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth(), 1)
  const lastDayMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 0)
  lastDayMonth.setHours(23,59,59,999)
  const monthLessons = (await (prisma as any).lesson.findMany({
    where: { startsAt: { gte: firstDayMonth }, endsAt: { lte: lastDayMonth }, logopedId: targetUserId },
    orderBy: { startsAt: 'asc' },
    include: { enrolls: { include: { child: true } }, bookings: true, evaluations: true },
  })) as any[]

  // Load templates and blocked times for текущего логопеда
  const templates = (await ((prisma as any).workTemplate?.findMany
    ? (prisma as any).workTemplate.findMany({ where: { userId: targetUserId }, orderBy: [{ dayOfWeek: 'asc' }, { startMinutes: 'asc' }] })
    : Promise.resolve([]))) as any[]
  const blocked = (await ((prisma as any).blockedTime?.findMany
    ? (prisma as any).blockedTime.findMany({ where: { userId: targetUserId }, orderBy: { startsAt: 'asc' } })
    : Promise.resolve([]))) as any[]

  // Настройки сетки слотов
  const slotMin = (dbUser as any)?.scheduleSlotMinutes || 30
  const breakMin = (dbUser as any)?.scheduleBreakMinutes || 0

  // Дети для записи: только закреплённые за текущим логопедом и не в архиве
  const children = isSupervisorMode ? [] : await (prisma as any).child.findMany({ where: { logopedId: targetUserId, isArchived: false }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] })

  function generateSlotsForDay(date: Date) {
    const dow = date.getDay() || 7
    const intervals = templates.filter(t => t.dayOfWeek === dow)
    const slots: { start: Date; end: Date }[] = []
    for (const it of intervals) {
      let cursor = new Date(date)
      cursor.setHours(Math.floor(it.startMinutes/60), it.startMinutes%60, 0, 0)
      const endDay = new Date(date)
      endDay.setHours(Math.floor(it.endMinutes/60), it.endMinutes%60, 0, 0)
      while (cursor < endDay) {
        const s = new Date(cursor)
        const e = new Date(s)
        e.setMinutes(e.getMinutes() + slotMin)
        if (e > endDay) break
        slots.push({ start: new Date(s), end: new Date(e) })
        cursor = new Date(e)
        if (breakMin) cursor.setMinutes(cursor.getMinutes() + breakMin)
      }
    }
    return slots
  }

  function slotStatus(start: Date, end: Date): { kind: 'empty'|'free'|'busy'|'blocked'|'booked'; title?: string; lessonId?: string; bookingId?: string; childId?: string } {
    const nowLocal = new Date()
    const sd = new Date(start); const ed = new Date(end)
    const today = new Date(nowLocal); today.setHours(0,0,0,0)
    const sDay = new Date(sd); sDay.setHours(0,0,0,0)
    // Сначала проверяем блокировки
    const overlapBlocked = blocked.find(b => new Date(b.startsAt) < end && new Date(b.endsAt) > start)
    if (overlapBlocked) return { kind: 'blocked', title: overlapBlocked.reason || 'Заблокировано' }
    // Ищем урок для отображения: только точное совпадение или совпадение по началу.
    // Простое пересечение больше НЕ отображаем, чтобы короткие/длинные уроки не дублировались на сетке слотов.
    const lessonExact = lessons.find(l => new Date(l.startsAt).getTime() === start.getTime() && new Date(l.endsAt).getTime() === end.getTime())
    const lessonSameStart = lessons.find(l => new Date(l.startsAt).getTime() === start.getTime())
    const lesson = lessonExact || lessonSameStart
    if (!lesson) {
      // если слот в прошедшем дне, либо в текущем дне, но время слота вышло — показываем как прошедшее
      if (sDay < today || (sDay.getTime() === today.getTime() && ed < nowLocal)) return { kind: 'empty', title: 'past' }
      return { kind: 'empty' }
    }
    const enrolledActive = (lesson.enrolls || []).find((en: any) => en.status === 'ENROLLED')
    if (enrolledActive?.child) {
      const childName = `${enrolledActive.child.lastName} ${enrolledActive.child.firstName}`
      return { kind: 'busy', title: childName, lessonId: lesson.id, childId: enrolledActive.childId }
    }
    const activeBooking = (lesson.bookings || []).find((b: any) => b.status === 'ACTIVE')
    if (activeBooking) {
      return { kind: 'booked', title: activeBooking.holder, lessonId: lesson.id, bookingId: activeBooking.id }
    }
    return { kind: 'free', lessonId: lesson.id }
  }

  return (
    <div className="container space-y-3 py-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2 items-center">
          {subs.length > 0 && (
            <form method="get" className="flex items-center gap-2">
              <input type="hidden" name="view" value={view} />
              <input type="hidden" name="weekOffset" value={offset} />
              <select name="viewUserId" defaultValue={targetUserId} className="input input-sm">
                <option value={selfId}>Моё</option>
                {subs.map((r: any) => (
                  <option key={r.subordinate.id} value={r.subordinate.id}>{r.subordinate.name || r.subordinate.email}</option>
                ))}
              </select>
              <button className="btn btn-outline btn-xs">Показать</button>
            </form>
          )}
        </div>
      </div>
      {isSupervisorMode && (
        <div className="rounded border p-3 bg-slate-50 text-slate-800">
          <div className="text-sm">
            Режим просмотра: <b>подчинённый</b>. Доступны только просмотр расписания и отправка заявок на консультацию.
          </div>
        </div>
      )}
      {/* убран подзаголовок с датами недели для компактности */}
      {consultState && (
        <div className={`rounded border p-3 ${consultState==='approved' ? 'bg-emerald-50 text-emerald-800' : consultState==='rejected' ? 'bg-amber-50 text-amber-900' : 'bg-indigo-50 text-indigo-900'}`}>
          {consultState==='approved' && 'Заявка принята. Карточка может быть создана и ребёнок записан.'}
          {consultState==='rejected' && 'Заявка отклонена.'}
          {consultState==='sent' && 'Запрос консультации отправлен подчинённому.'}
          {consultState==='sent_existing_parent_child_created' && 'Пользователь найден и родителю добавлен новый ребёнок. Запрос на консультацию отправлен.'}
          {consultState==='sent_child_unarchived' && 'Карточка ребёнка разархивирована. Запрос на консультацию отправлен.'}
          {consultState==='child_attached_elsewhere' && 'Нельзя создать заявку: ребёнок уже закреплён за другим логопедом.'}
        </div>
      )}

      {view === 'week' ? (
        <section className="section" key={`week-${offset}-${targetUserId}`} style={{ background: 'var(--card-bg)' }}>
          <div className="mb-2 flex items-center justify-end gap-1 flex-wrap">
            <a href={`?view=week${isSupervisorMode?`&viewUserId=${targetUserId}`:''}`} className={`btn btn-xs ${String(view)==='week'?'btn-secondary':''}`}>Неделя</a>
            <a href={`?view=month${isSupervisorMode?`&viewUserId=${targetUserId}`:''}`} className={`btn btn-xs ${String(view)==='month'?'btn-secondary':''}`}>Месяц</a>
            <span className="inline-block w-px h-5 bg-slate-200 mx-1" />
            <a href={`?weekOffset=${offset-1}${isSupervisorMode?`&viewUserId=${targetUserId}`:''}`} className="btn btn-outline btn-xs">← Назад</a>
            <a href={`?weekOffset=0${isSupervisorMode?`&viewUserId=${targetUserId}`:''}`} className="btn btn-outline btn-xs">Сегодня</a>
            <a href={`?weekOffset=${offset+1}${isSupervisorMode?`&viewUserId=${targetUserId}`:''}`} className="btn btn-outline btn-xs">Вперёд →</a>
          </div>
          {!isSupervisorMode && (
            <form action={generateSlotsNext4Weeks} className="mb-4 flex flex-wrap items-end gap-2 justify-start sm:justify-end">
              <div className="text-sm text-muted">
                Сгенерировать слоты с текущей недели на 4 недели вперёд (прошлые недели не изменяются)
              </div>
              <button className="btn btn-secondary">Сгенерировать на 4 недели</button>
            </form>
          )}
          {!isSupervisorMode && latestEnd && daysLeft <= 7 && (
            <div className="mb-4 flex items-center justify-between rounded border p-3 bg-amber-50">
              <div className="text-sm text-amber-800">Горизонт расписания заканчивается {latestEnd.toLocaleDateString('ru-RU')} (через {Math.max(daysLeft,0)} дн.). Продлить ещё на 4 недели?</div>
              <form action={extendSlots4Weeks}>
                <button className="btn btn-accent btn-sm">Продлить на 4 недели</button>
              </form>
            </div>
          )}
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 7 }).map((_, idx) => {
              const d = new Date(monday)
              d.setDate(monday.getDate() + idx)
              const slots = generateSlotsForDay(d)
              // Если рабочее время не настроено — день не показываем
              if (slots.length === 0) return null
              // Рассчитываем видимые слоты: скрываем прошедшие пустые слоты без записей/броней/оценок
              const visibleSlots = slots.filter((s) => {
                const st = slotStatus(s.start, s.end)
                const isPast = s.end < new Date()
                if (st.kind === 'empty') return false
                if (isPast) {
                  // В прошлом показываем только слоты, у которых есть урок (нужно оценить или уже оценено)
                  return Boolean(st.lessonId)
                }
                // Будущие слоты: показываем любые кроме empty
                return true
              })
              if (visibleSlots.length === 0) return null
              return (
                <div key={idx} className="card p-2" style={{ background: 'var(--card-bg)' }}>
                  <div className="mb-1 text-sm font-semibold">
                    {d.toLocaleDateString('ru-RU', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                  </div>
                  <div className="space-y-1">
                    {visibleSlots.map((s, i) => {
                      const t1 = s.start.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                      const t2 = s.end.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                      const st = slotStatus(s.start, s.end)
                      const isPast = s.end < new Date()
                      if (st.kind === 'empty') return null
                      // не скрываем past free — если есть урок, он уже отфильтрован в visibleSlots
                      const lessonObj = lessons.find(l => l.id === st.lessonId) as any
                      const evals = (lessonObj?.evaluations || []) as any[]
                      const consults = (lessonObj?.consultationRequests || []) as any[]
                      const pendingConsult = consults.find((c: any) => c.status === 'PENDING')
                      const evCancelled = evals.some(ev => ev.status === 'CANCELLED')
                      const doneList = evals.filter(ev => ev.status === 'DONE')
                      const evDone = doneList.length > 0
                      const evConfirmed = evals.some(ev => ev.status === 'CONFIRMED')
                      const lastDone = doneList.length > 0 ? doneList.sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime())[0] : null
                      const hasFinal = evDone || evCancelled || evConfirmed
                      const needsEval = (isPast && Boolean(st.lessonId) && !hasFinal)
                      return (
                        <div key={i} className={`rounded border p-1 text-sm ${pendingConsult ? (isSupervisorMode ? 'slot-pending-supervisor' : 'slot-pending-subordinate') : ''}`}>
                          <div className="flex items-center justify-between gap-2">
                            <div className="truncate">
                              <span className="font-medium">{t1}</span> — {t2}
                              {st.kind==='busy' && <span className="ml-1 text-muted">{st.title}</span>}
                              {st.kind==='booked' && <span className="ml-1 text-amber-700">Бронь</span>}
                              {st.kind==='blocked' && <span className="ml-1 text-muted">{st.title}</span>}
                              {pendingConsult && <span className="ml-1 text-indigo-700 text-xs">Запрос консультации</span>}
                            </div>
                            {needsEval && (
                              <span className="badge badge-red">Оценить</span>
                            )}
                          </div>
                          {evDone && lastDone && (() => {
                            const vals = [lastDone.homeworkRating, lastDone.lessonRating, lastDone.behaviorRating].filter((v: any) => typeof v === 'number') as number[]
                            const avg = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0
                            const emoji = avg>=4.5 ? '😄' : avg>=3.5 ? '🙂' : avg>=2.5 ? '😐' : avg>=1.5 ? '🙁' : '😞'
                            const color = (v: number) => v>=5? 'text-emerald-700' : v>=4? 'text-emerald-600' : v>=3? 'text-amber-600' : v>=2? 'text-orange-600' : 'text-red-600'
                            const chip = (label: string, v?: number) => (
                              <div className="flex items-center gap-1" key={label}>
                                <span className="text-[10px] text-muted">{label}</span>
                                <span className={`inline-flex items-center justify-center rounded-full border px-1.5 py-[1px] text-xs ${typeof v==='number'?color(v):'text-muted'}`}>
                                  {typeof v==='number'? v : '—'}
                                </span>
                              </div>
                            )
                            return (
                              <div className="mt-1 flex items-center justify-between">
                                <div className="flex items-center gap-3 text-sm">
                                  {chip('Д/З', lastDone.homeworkRating)}
                                  {chip('Занятие', lastDone.lessonRating)}
                                  {chip('Поведение', lastDone.behaviorRating)}
                                </div>
                                <div className="ml-2 text-base" title={`Средняя: ${avg.toFixed(1)}`}>{emoji}</div>
                              </div>
                            )
                          })()}
                          {/* Руководитель — создаёт запрос консультации в свободном слоте подчинённого */}
                          {isSupervisorMode && st.kind==='free' && st.lessonId && !isPast && (
                            <form action={createConsultationRequest} className="mt-1 grid gap-1 sm:grid-cols-5 items-end rounded border p-2" style={{ background: 'color-mix(in srgb, var(--card-bg) 85%, transparent)' }}>
                              <input type="hidden" name="lessonId" value={st.lessonId} />
                              <input type="hidden" name="subordinateId" value={targetUserId} />
                              <div className="sm:col-span-2"><input name="parentEmail" placeholder="Email родителя" className="input input-sm" required /></div>
                              <div><input name="childLastName" placeholder="Фамилия ребёнка" className="input input-sm" required /></div>
                              <div><input name="childFirstName" placeholder="Имя ребёнка" className="input input-sm" required /></div>
                              <div className="sm:col-span-5"><input name="note" placeholder="Комментарий (опц.)" className="input input-sm" /></div>
                              <div className="sm:col-span-5"><button className="btn btn-primary btn-xs">Запросить</button></div>
                            </form>
                          )}

                          {/* Подчинённый — видит входящий запрос и может принять/отклонить */}
                          {!isSupervisorMode && pendingConsult && st.lessonId && (
                            <div className="mt-1 rounded border p-2 bg-emerald-50">
                              <div className="text-sm font-medium">Запрос консультации от руководителя</div>
                              <div className="text-xs text-muted">Родитель: {pendingConsult.parentEmail} · Ребёнок: {pendingConsult.childLastName} {pendingConsult.childFirstName}</div>
                              {pendingConsult.note && <div className="text-xs text-muted">Комментарий: {pendingConsult.note}</div>}
                              <div className="mt-1 flex flex-wrap gap-2 items-end">
                                <form action={approveConsultationRequest}>
                                  <input type="hidden" name="requestId" value={pendingConsult.id} />
                                  <button className="btn btn-secondary btn-xs">Принять</button>
                                </form>
                                <form action={rejectConsultationRequest}>
                                  <input type="hidden" name="requestId" value={pendingConsult.id} />
                                  <button className="btn btn-danger btn-xs">Отклонить</button>
                                </form>
                              </div>
                            </div>
                          )}
                          {/* формы записи/брони */}
                          {!isSupervisorMode && st.kind==='free' && st.lessonId && !isPast && (
                            <form action={enrollChildToLesson} className="mt-2 flex items-center gap-2">
                              <input type="hidden" name="lessonId" value={st.lessonId} />
                              <select name="childId" className="input w-full">
                                {children.map((c: any) => (
                                  <option key={c.id} value={c.id}>{c.lastName} {c.firstName}</option>
                                ))}
                              </select>
                              <button className="btn btn-secondary btn-sm">Записать</button>
                            </form>
                          )}
                          {!isSupervisorMode && st.kind==='free' && st.lessonId && !isPast && (
                            <form action={createBooking} className="mt-2 grid gap-2 sm:grid-cols-2 items-end">
                              <input type="hidden" name="lessonId" value={st.lessonId} />
                              <label className="grid gap-1">
                                <span className="text-xs text-muted">Имя для брони</span>
                                <input name="holder" placeholder="Например: Фамилия Имя" className="input" />
                              </label>
                              <div>
                                <button className="btn btn-outline btn-sm">Бронь</button>
                              </div>
                            </form>
                          )}

                          {/* Прошедшие слоты — если нет оценки/отмены: Отменен / Оценить (только для владельца своего расписания) */}
                          {!isSupervisorMode && st.lessonId && (st.kind==='busy' || st.kind==='booked') && (new Date(`${d.toDateString()} ${t2}`) < new Date()) && !(evDone || evCancelled) && (
                            <div className="mt-1 flex items-center gap-2">
                              <form action={markLessonCancelled}>
                                <input type="hidden" name="lessonId" value={st.lessonId} />
                                {st.childId && <input type="hidden" name="childId" value={st.childId} />}
                                <button className="btn btn-warning btn-xs">Отменен</button>
                              </form>
                              <Link href={`/logoped/lesson/${st.lessonId}`} className="btn btn-primary btn-xs">Оценить</Link>
                            </div>
                          )}
                          {!isSupervisorMode && st.kind==='booked' && st.bookingId && !isPast && (
                            <div className="mt-1 flex items-center gap-2">
                              <form action={approveParentBooking}>
                                <input type="hidden" name="bookingId" value={st.bookingId} />
                                <button className="btn btn-secondary btn-xs">Принять</button>
                              </form>
                              <form action={rejectParentBooking}>
                                <input type="hidden" name="bookingId" value={st.bookingId} />
                                <button className="btn btn-danger btn-xs">Отклонить</button>
                              </form>
                              <form action={cancelBooking}>
                                <input type="hidden" name="bookingId" value={st.bookingId} />
                                <button className="btn btn-outline btn-xs">Снять бронь</button>
                              </form>
                            </div>
                          )}
                          {!isSupervisorMode && st.kind==='busy' && st.lessonId && st.childId && !isPast && (
                            <form action={cancelEnrollment} className="mt-1 flex items-center gap-2">
                              <input type="hidden" name="lessonId" value={st.lessonId} />
                              <input type="hidden" name="childId" value={st.childId} />
                              <button className="btn btn-danger btn-xs">Отменить запись</button>
                            </form>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ) : null}

      {view === 'month' && (
        <section className="section" key={`month-${mOff}-${targetUserId}`} style={{ background: 'var(--card-bg)' }}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Календарь месяца</h2>
            <div className="flex items-center gap-1 flex-wrap">
              <a href={`?view=week${isSupervisorMode?`&viewUserId=${targetUserId}`:''}`} className={`btn btn-xs`}>Неделя</a>
              <a href={`?view=month${isSupervisorMode?`&viewUserId=${targetUserId}`:''}`} className={`btn btn-xs btn-secondary`}>Месяц</a>
              <span className="inline-block w-px h-5 bg-slate-200 mx-1" />
              <a href={`?view=month&monthOffset=${mOff-1}${isSupervisorMode?`&viewUserId=${targetUserId}`:''}`} className="btn btn-outline btn-xs">← Пред. месяц</a>
              <a href={`?view=month&monthOffset=0${isSupervisorMode?`&viewUserId=${targetUserId}`:''}`} className="btn btn-outline btn-xs">Текущий</a>
              <a href={`?view=month&monthOffset=${mOff+1}${isSupervisorMode?`&viewUserId=${targetUserId}`:''}`} className="btn btn-outline btn-xs">След. месяц →</a>
            </div>
          </div>
          {/* Подсказка о горизонте слотов */}
          {!isSupervisorMode && latestEnd && latestEnd < lastDayMonth && (
            <div className="mb-4 flex items-center justify-between rounded border p-3 bg-amber-50">
              <div className="text-sm text-amber-800">Слоты сгенерированы до {latestEnd.toLocaleDateString('ru-RU')}. Продлить ещё на 4 недели?</div>
              <form action={extendSlots4Weeks}>
                <button className="btn btn-accent btn-sm">Продлить на 4 недели</button>
              </form>
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {Array.from({ length: lastDayMonth.getDate() }, (_, i) => i + 1).map(d => {
              const date = new Date(firstDayMonth.getFullYear(), firstDayMonth.getMonth(), d)
              const dayLessons = monthLessons.filter(x => new Date(x.startsAt).getDate() === d)
              return (
                <div key={d} className="card" style={{ background: 'var(--card-bg)' }}>
                  <div className="mb-2 text-sm font-semibold">{date.toLocaleDateString('ru-RU')}</div>
                  {dayLessons.length === 0 ? (
                    <div className="text-xs text-muted">Нет занятий</div>
                  ) : (
                    <ul className="space-y-1">
                      {dayLessons.map(x => {
                        const startsAt = new Date(x.startsAt)
                        const endsAt = new Date(x.endsAt)
                        const isPast = endsAt < now
                        const enrolled = (x.enrolls?.[0]?.child) as any
                        const hadDone = Array.isArray(x.evaluations) && x.evaluations.some((ev: any) => ev.status === 'DONE')
                        // прошедшие без состоявшегося занятия скрываем
                        if (isPast && !hadDone) return null
                        // имя и первая буква фамилии
                        const name = enrolled ? `${enrolled.firstName} ${enrolled.lastName ? (enrolled.lastName[0] + '.') : ''}` : 'вакант'
                        const timeStr = startsAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                        const green = isPast && hadDone
                        return (
                          <li key={x.id} className={`text-sm ${green ? 'text-emerald-700' : ''}`}>
                            <span className="font-medium">{timeStr}</span>
                            <span className="ml-2">{name}</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      
    </div>
  )
}
