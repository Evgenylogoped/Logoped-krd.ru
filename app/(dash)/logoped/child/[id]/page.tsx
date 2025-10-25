import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'
import ParentPassword from '@/components/ParentPassword'
import { updateChild, uploadMaterial, deleteMaterial, addProgress, deleteProgress, addReward, deleteReward, uploadChildPhoto, updateParent, requestTransfer, approveTransfer, rejectTransfer, purgeStorageNow } from './actions'
import { regenerateParentPassword } from '../../clients/actions'
import SavedToast from '@/components/SavedToast'
import ChildPhotoUploader from '@/components/ChildPhotoUploader'
import Link from 'next/link'
import ChildTabSelector from '@/components/ChildTabSelector'
import { getLogopedSubscriptionLimitMb, getStorageUsageMb } from '@/lib/storage'

export default async function LogopedChildPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<{ tab?: string; evalPage?: string; err?: string; saved?: string; evalMonth?: string; historyPage?: string }> }) {
  const { id } = await params
  const sp = (searchParams ? await searchParams : {}) as { tab?: string; evalPage?: string; err?: string; saved?: string; evalMonth?: string; historyPage?: string }
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const meId = (session?.user as any)?.id as string
  if (!session || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role)) return <div>Доступ запрещён</div>

  const decryptVisiblePassword = (enc?: string | null): string | null => {
    try {
      if (!enc) return null
      if (enc.startsWith('plain:')) {
        const b64 = enc.slice(6)
        return Buffer.from(b64, 'base64').toString('utf8')
      }
      const rawKey = process.env.PARENT_PWD_KEY || ''
      if (!rawKey) return null
      const buf = Buffer.from(enc, 'base64')
      if (buf.length < 12 + 16 + 1) return null
      const iv = buf.subarray(0, 12)
      const tag = buf.subarray(12, 28)
      const data = buf.subarray(28)
      const key = Buffer.from(rawKey.padEnd(32, '0').slice(0, 32))
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
      decipher.setAuthTag(tag)
      const dec = Buffer.concat([decipher.update(data), decipher.final()])
      return dec.toString('utf8')
    } catch {
      return null
    }
  }

  const tab = sp.tab || 'main'

  const child = await (prisma as any).child.findUnique({
    where: { id },
    include: {
      parent: { include: { user: true } },
      documents: true,
      enrolls: { include: { lesson: true } },
    },
  })
  if (!child) return <div className="container py-6">Ребёнок не найден</div>

  // Список логопедов для привязки
  const logopeds = await (prisma as any).user.findMany({ where: { role: 'LOGOPED' }, orderBy: { name: 'asc' } })

  // Заявки на передачу ребёнка
  const transfers = await (prisma as any).transferRequest?.findMany
    ? await (prisma as any).transferRequest.findMany({ where: { childId: id }, orderBy: { createdAt: 'desc' } })
    : []

  // Отдельные guarded‑загрузки прогресса и наград, чтобы не падать до prisma generate/db push
  const progressList = (await ((prisma as any).progressEntry?.findMany
    ? (prisma as any).progressEntry.findMany({ where: { childId: id }, orderBy: { date: 'desc' } })
    : Promise.resolve([]))) as any[]
  const rewardsList = (await ((prisma as any).childReward?.findMany
    ? (prisma as any).childReward.findMany({ where: { childId: id }, orderBy: { issuedAt: 'desc' } })
    : Promise.resolve([]))) as any[]

  // Статистика по занятиям ребёнка (прошедшие занятия)
  const nowStats = new Date()
  const childEnrolls = await (prisma as any).enrollment.findMany({
    where: { childId: id, status: 'ENROLLED', lesson: { endsAt: { lt: nowStats } } },
    include: { lesson: true },
    orderBy: { lesson: { startsAt: 'desc' } },
  })
  const totalLessons = childEnrolls.length
  const totalMinutes = childEnrolls.reduce((acc: number, e: any) => acc + Math.max(0, (new Date(e.lesson.endsAt).getTime() - new Date(e.lesson.startsAt).getTime())/60000), 0)
  const lastVisit = childEnrolls[0]?.lesson?.startsAt ? new Date(childEnrolls[0].lesson.startsAt) : null

  // Лента оценок: фильтр по месяцу + пагинация
  const evalPage = Math.max(1, Number(sp.evalPage || '1') || 1)
  const pageSize = 10
  const evalMonth = String(sp.evalMonth || '')
  let monthStart: Date | null = null
  let monthEnd: Date | null = null
  if (/^\d{4}-\d{2}$/.test(evalMonth)) {
    const [y,m] = evalMonth.split('-').map(Number)
    monthStart = new Date(y, (m||1)-1, 1)
    monthEnd = new Date(y, (m||1), 1)
  }
  const whereEval: any = { childId: id }
  if (monthStart && monthEnd) {
    whereEval.OR = [
      { lesson: { startsAt: { gte: monthStart, lt: monthEnd } } },
      { createdAt: { gte: monthStart, lt: monthEnd } },
    ]
  }
  const [evals, evalTotal] = await Promise.all([
    (prisma as any).lessonEvaluation.findMany({
      where: whereEval,
      select: {
        id: true,
        childId: true,
        homeworkRating: true,
        lessonRating: true,
        behaviorRating: true,
        comment: true,
        showToParent: true,
        status: true,
        createdAt: true,
        lesson: { select: { startsAt: true, endsAt: true, title: false } },
      },
      orderBy: [{ createdAt: 'desc' }],
      take: pageSize,
      skip: (evalPage - 1) * pageSize,
    }),
    (prisma as any).lessonEvaluation.count({ where: whereEval })
  ])
  const evalTotalPages = Math.max(1, Math.ceil((evalTotal || 0) / pageSize))

  // Helper: month formatting
  const ruMonth = (d: Date) => d.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })
  const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2, '0')}`
  const buildLastMonths = (n=12) => {
    const out: { key: string; label: string }[] = []
    const now = new Date()
    for (let i=0;i<n;i++) {
      const dt = new Date(now.getFullYear(), now.getMonth()-i, 1)
      out.push({ key: monthKey(dt), label: ruMonth(dt) })
    }
    return out
  }

  // Использование хранилища по подписке логопеда
  const [limitMb, usedMb] = await Promise.all([
    getLogopedSubscriptionLimitMb(meId),
    getStorageUsageMb(meId),
  ])
  const usedPct = limitMb > 0 ? Math.min(100, Math.round((usedMb/limitMb)*100)) : 0

  return (
    <div className="container space-y-6 py-6">

      {sp?.saved==='1' && (
        <>
          <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Изменения сохранены.</div>
          {/* Тост уведомление */}
          <SavedToast message="Изменения сохранены" />
        </>
      )}
      {sp?.saved==='0' && (
        <div className="rounded border p-3 bg-slate-100 text-slate-700 text-sm">Изменений нет.</div>
      )}

      {sp?.err && (
        <div className={`rounded border p-3 text-sm ${sp.err==='rate_block' ? 'bg-amber-50 text-amber-900' : 'bg-rose-50 text-rose-900'}`}>
          {sp.err === 'invalid_rate_lesson' && 'Некорректная стоимость занятия. Введите число, например 1200 или 1200.50.'}
          {sp.err === 'invalid_rate_consult' && 'Некорректная стоимость консультации. Введите число, например 1200 или 1200.50.'}
          {sp.err === 'rate_block' && (
            <span>
              Нельзя поменять цену до взаиморасчета с руководителем. Перейдите в
              {' '}<a className="underline" href="/logoped/finance" target="_blank">Лог. финансы</a> для завершения расчётов, затем повторите попытку.
            </span>
          )}
          {sp.err === 'save_failed' && 'Не удалось сохранить изменения. Попробуйте ещё раз.'}
        </div>
      )}

      {/* Компактный селектор для мобильных */}
      <ChildTabSelector childId={child.id} current={tab} />
      {/* Кнопки‑вкладки для планшетов/десктопа */}
      <nav className="hidden sm:flex flex-wrap gap-2">
        <Link href={`?tab=main`} className={`btn btn-xs ${tab==='main'?'btn-secondary':''}`}>Основное</Link>
        <Link href={`?tab=parent`} className={`btn btn-xs ${tab==='parent'?'btn-secondary':''}`}>Родитель</Link>
        <Link href={`?tab=history`} className={`btn btn-xs ${tab==='history'?'btn-secondary':''}`}>История</Link>
        <Link href={`?tab=materials`} className={`btn btn-xs ${tab==='materials'?'btn-secondary':''}`}>Материалы и ДЗ</Link>
        <Link href={`?tab=progress`} className={`btn btn-xs ${tab==='progress'?'btn-secondary':''}`}>Прогресс</Link>
        <Link href={`?tab=rewards`} className={`btn btn-xs ${tab==='rewards'?'btn-secondary':''}`}>Награды</Link>
      </nav>

      {tab === 'main' && (
        <section className="section">
          <h2 className="mb-3 text-lg font-semibold">Основное</h2>
          {/* Фото + загрузка с кроппером */}
          <div className="grid gap-3 sm:grid-cols-4 mb-4 items-start">
            <div className="sm:col-span-2">
              <ChildPhotoUploader childId={child.id} action={uploadChildPhoto as any} defaultImageUrl={child.photoUrl || null} />
            </div>
          </div>

          <form action={updateChild} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="id" value={child.id} />
            <input name="lastName" defaultValue={child.lastName} placeholder="Фамилия" className="input" required />
            <input name="firstName" defaultValue={child.firstName} placeholder="Имя" className="input" required />
            <input name="birthDate" type="date" defaultValue={child.birthDate ? new Date(child.birthDate).toISOString().slice(0,10) : ''} className="input" />
            <input name="diagnosis" defaultValue={child.diagnosis ?? ''} placeholder="Диагноз (опц.)" className="input" />
            <textarea name="conclusion" defaultValue={(child as any).conclusion ?? ''} placeholder="Заключение логопеда (опц.)" className="input sm:col-span-2 min-h-24" />
            <div className="sm:col-span-2">
              <label className="block text-sm mb-1">Логопед</label>
              <select name="logopedId" defaultValue={(child as any).logopedId ?? ''} className="input !py-2 !px-2">
                <option value="">Не закреплён</option>
                {logopeds.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name || u.email}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" name="allowSelfEnroll" defaultChecked={(child as any).allowSelfEnroll ?? false} />
              <span className="text-sm">Разрешить родителю самозапись</span>
            </label>
            {/* Чекбоксы видимости для родителя */}
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showDiagnosisToParent" defaultChecked={(child as any).showDiagnosisToParent ?? false} />
              <span className="text-sm">Показать диагноз родителю</span>
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showConclusionToParent" defaultChecked={(child as any).showConclusionToParent ?? false} />
              <span className="text-sm">Показать заключение родителю</span>
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-muted">Фактическая цена занятия</span>
              <input name="rateLesson" type="number" step="0.01" defaultValue={(child as any).rateLesson ?? ''} placeholder="Например, 1200" className="input" />
            </label>
            <input name="rateConsultation" type="number" step="0.01" defaultValue={(child as any).rateConsultation ?? ''} placeholder="Стоимость консультации" className="input" />
            <div className="sm:col-span-4">
              <button className="btn btn-primary">Сохранить</button>
            </div>
          </form>
        </section>
      )}

      {/* Оценки занятий */}
      {tab === 'main' && (
        <section className="section">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Оценки занятий</h2>
            <a href={`/api/export/child/${child.id}/evaluations`} target="_blank" className="btn btn-outline btn-sm">Экспорт CSV</a>
          </div>
          {/* Фильтр по месяцу */}
          <form method="get" className="flex items-end gap-2 mb-3">
            <input type="hidden" name="tab" value="main" />
            <label className="grid gap-1">
              <span className="text-xs text-muted">Месяц</span>
              <select name="evalMonth" defaultValue={evalMonth} className="input !py-2 !px-2 min-w-[180px]">
                <option value="">Все месяцы</option>
                {buildLastMonths(12).map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </label>
            <button className="btn btn-sm">Показать</button>
            {evalMonth && (
              <a href={`?tab=main`} className="btn btn-outline btn-sm">Сбросить</a>
            )}
          </form>
          <div className="space-y-2">
            {(evals as any[]).length === 0 && (
              <div className="text-sm text-muted">Нет оценок по занятиям</div>
            )}
            {/* Группировка по месяцу */}
            {(() => {
              const groups = Object.entries((evals as any[]).reduce((acc: Record<string, any[]>, ev: any) => {
                const dt = new Date(ev.lesson?.startsAt || ev.createdAt)
                const key = monthKey(dt)
                if (!acc[key]) acc[key] = []
                acc[key].push(ev)
                return acc
              }, {} as Record<string, any[]>)) as [string, any[]][]
              return groups
                .sort((a, b) => (a[0] < b[0] ? 1 : -1))
                .map(([key, list]) => {
                  const [y, m] = key.split('-').map(Number)
                  const dt = new Date((y || 0), ((m || 1) - 1), 1)
                  return (
                    <div key={key} className="space-y-2">
                      <div className="text-sm font-medium mt-2">{ruMonth(dt)}</div>
                      {list.map((ev: any) => (
                        <div key={ev.id} className="p-3 space-y-2 rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                          <div className="flex items-center justify-between">
                            <div className="text-sm text-muted">{new Date(ev.lesson?.startsAt || ev.createdAt).toLocaleString('ru-RU')}</div>
                            <span className={`badge ${ev.status==='CANCELLED'?'badge-red':'badge-green'}`}>{ev.status==='CANCELLED'?'Не состоялось':'Состоялось'}</span>
                          </div>
                          {ev.status==='DONE' && (
                            <div className="grid gap-2 sm:grid-cols-4 text-sm">
                              <div>Д/З: {ev.homeworkRating ?? '—'}</div>
                              <div>Занятие: {ev.lessonRating ?? '—'}</div>
                              <div>Поведение: {ev.behaviorRating ?? '—'}</div>
                              <div className="sm:col-span-4 text-muted">Комментарий: {ev.comment || '—'}</div>
                            </div>
                          )}
                          {ev.showToParent && <div className="text-xs text-emerald-700">Виден родителям</div>}
                        </div>
                      ))}
                    </div>
                  )
                })
            })()}
          </div>
          {evalTotalPages > 1 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <div>Страница {evalPage} из {evalTotalPages}</div>
              <div className="flex gap-2">
                <a className={`btn btn-outline btn-sm ${evalPage<=1?'pointer-events-none opacity-50':''}`} href={`?tab=main&evalMonth=${evalMonth}&evalPage=${evalPage-1}`}>← Назад</a>
                <a className={`btn btn-outline btn-sm ${evalPage>=evalTotalPages?'pointer-events-none opacity-50':''}`} href={`?tab=main&evalMonth=${evalMonth}&evalPage=${evalPage+1}`}>Вперёд →</a>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Статистика */}
      {tab === 'main' && (
        <section className="section">
          <h2 className="mb-3 text-lg font-semibold">Статистика</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="card p-3">
              <div className="text-xs text-muted">Занятий всего</div>
              <div className="text-2xl font-semibold">{totalLessons}</div>
            </div>
            <div className="card p-3">
              <div className="text-xs text-muted">Нагрузки всего</div>
              <div className="text-2xl font-semibold">{Math.round(totalMinutes)} мин</div>
            </div>
            <div className="card p-3">
              <div className="text-xs text-muted">Последний визит</div>
              <div className="text-lg">{lastVisit ? lastVisit.toLocaleString('ru-RU') : '—'}</div>
            </div>
          </div>
        </section>
      )}

      {/* Передача ребёнка другому логопеду */}
      {tab === 'main' && (
        <section className="section">
          <h2 className="mb-3 text-lg font-semibold">Передача ребёнка</h2>
          <form action={requestTransfer} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="childId" value={child.id} />
            <div className="sm:col-span-2">
              <label className="block text-sm mb-1">Кому передать</label>
              <select name="toLogopedId" className="input !py-2 !px-2">
                {logopeds
                  .filter((u: any) => u.id !== (child as any).logopedId)
                  .map((u: any) => (
                    <option key={u.id} value={u.id}>{u.name || u.email}</option>
                  ))}
              </select>
            </div>
            <div className="sm:col-span-2 flex items-end">
              <button className="btn btn-accent">Отправить запрос</button>
            </div>
          </form>

          <div className="mt-4">
            <div className="font-medium mb-2">Заявки</div>
            {(!transfers || transfers.length === 0) && (
              <div className="text-sm text-muted">Заявок нет</div>
            )}
            <div className="space-y-2">
              {transfers.map((t: any) => (
                <div key={t.id} className="p-3 flex items-center justify-between rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                  <div className="text-sm">
                    <span className="font-medium">{t.status}</span>
                    <span className="ml-2">→ логопед ID: {t.toLogopedId}</span>
                    {t.fromLogopedId && <span className="ml-2 text-muted">от логопеда ID: {t.fromLogopedId}</span>}
                    <span className="ml-2 text-muted">{new Date(t.createdAt).toLocaleString('ru-RU')}</span>
                  </div>
                  <div className="flex gap-2">
                    {t.status === 'PENDING' && (
                      <>
                        {((role==='ADMIN' || role==='SUPER_ADMIN') || t.toLogopedId === meId) && (
                          <form action={approveTransfer}>
                            <input type="hidden" name="transferId" value={t.id} />
                            <button className="btn btn-secondary btn-sm">Подтвердить</button>
                          </form>
                        )}
                        {((role==='ADMIN' || role==='SUPER_ADMIN') || t.toLogopedId === meId || t.fromLogopedId === meId) && (
                          <form action={rejectTransfer}>
                            <input type="hidden" name="transferId" value={t.id} />
                            <button className="btn btn-danger btn-sm">Отклонить</button>
                          </form>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {tab === 'progress' && (
        <section className="section">
          <h2 className="mb-3 text-lg font-semibold">Прогресс</h2>
          <form action={addProgress} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="childId" value={child.id} />
            <input name="score" type="number" className="input" placeholder="Очки" defaultValue={0} />
            <input name="note" className="input sm:col-span-2" placeholder="Заметка (опц.)" />
            <button className="btn btn-primary">Добавить</button>
          </form>
          <div className="mt-4 space-y-2">
            {progressList.length === 0 && <div className="text-sm text-muted">Записей прогресса нет</div>}
            {progressList.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                <div>
                  <div className="font-medium">{p.score} очков</div>
                  <div className="text-sm text-muted">{new Date(p.date).toLocaleString('ru-RU')} {p.note ? `· ${p.note}` : ''}</div>
                </div>
                <form action={deleteProgress}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="childId" value={child.id} />
                  <button className="btn btn-danger text-sm">Удалить</button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'rewards' && (
        <section className="section">
          <h2 className="mb-3 text-lg font-semibold">Награды</h2>
          <form action={addReward} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="childId" value={child.id} />
            <select name="kind" className="input !py-2 !px-2">
              <option value="star">Звезда</option>
              <option value="medal">Медаль</option>
              <option value="cup">Кубок</option>
            </select>
            <input name="title" className="input sm:col-span-2" placeholder="Название (опц.)" />
            <button className="btn btn-primary">Назначить</button>
          </form>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {rewardsList.length === 0 && <div className="text-sm text-muted">Наград нет</div>}
            {rewardsList.map((r: any) => (
              <div key={r.id} className="card flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="badge">{r.kind}</span>
                  <div>
                    <div className="font-medium">{r.title || 'Без названия'}</div>
                    <div className="text-sm text-muted">{new Date(r.issuedAt).toLocaleString('ru-RU')}</div>
                  </div>
                </div>
                <form action={deleteReward}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="childId" value={child.id} />
                  <button className="btn btn-danger text-sm">Удалить</button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'parent' && (
        <section className="section">
          <h2 className="mb-3 text-lg font-semibold">Родитель</h2>
          <div className="space-y-1 mb-4">
            <div className="font-medium">{(child.parent as any).fullName || child.parent.user.name || child.parent.user.email}</div>
            <div className="text-sm text-muted">{(child.parent as any).phone ? `${(child.parent as any).phone} · ` : ''}{child.parent.user.email}</div>
            {(child.parent as any).info && <div className="text-sm text-muted">{(child.parent as any).info}</div>}
            {['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role) && (
              <ParentPassword value={decryptVisiblePassword((child.parent as any)?.visiblePasswordEncrypted) || null} email={child.parent.user.email} />
            )}
            {['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role) && !((child.parent as any)?.visiblePasswordEncrypted) && (
              <form action={regenerateParentPassword} className="mt-1">
                <input type="hidden" name="parentId" value={child.parent.id} />
                <button className="btn btn-sm">Сгенерировать пароль</button>
              </form>
            )}
          </div>
          <form action={updateParent} className="grid gap-3 sm:grid-cols-4">
            <input type="hidden" name="parentId" value={child.parent.id} />
            <input type="hidden" name="childId" value={child.id} />
            <input name="fullName" defaultValue={(child.parent as any).fullName ?? ''} placeholder="ФИО" className="input" />
            <input name="phone" defaultValue={(child.parent as any).phone ?? ''} placeholder="Телефон" className="input" />
            <input name="email" defaultValue={child.parent.user.email} placeholder="E-mail" className="input" />
            <input name="info" defaultValue={(child.parent as any).info ?? ''} placeholder="Иная информация" className="input sm:col-span-2" />
            <div className="sm:col-span-4">
              <button className="btn">Сохранить</button>
            </div>
          </form>
        </section>
      )}

      {tab === 'history' && (() => {
        const historyPage = Math.max(1, Number(sp.evalPage || sp.historyPage || '1') || 1)
        const histSize = 10
        const sorted = [...(child.enrolls as any[])].sort((a,b)=> new Date(b.lesson.startsAt).getTime()-new Date(a.lesson.startsAt).getTime())
        const total = sorted.length
        const totalPages = Math.max(1, Math.ceil(total / histSize))
        const slice = sorted.slice((historyPage-1)*histSize, historyPage*histSize)
        const makeHref = (p:number) => {
          const params = new URLSearchParams()
          params.set('tab','history')
          params.set('historyPage', String(p))
          return `?${params.toString()}`
        }
        return (
          <section className="section">
            <h2 className="mb-3 text-lg font-semibold">История занятий</h2>
            <div className="space-y-2">
              {total === 0 && <div className="text-sm text-muted">История отсутствует</div>}
              {slice.map((e: any) => (
                <div key={`${e.childId}:${e.lessonId}`} className="p-3 flex items-center justify-between rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                  <div>
                    <div className="font-medium">{e.lesson.title}</div>
                    <div className="text-sm text-muted">{new Date(e.lesson.startsAt).toLocaleString('ru-RU')} — {new Date(e.lesson.endsAt).toLocaleString('ru-RU')}</div>
                  </div>
                  <span className={`badge ${e.status==='ENROLLED' ? 'badge-green' : 'badge-gray'}`}>{e.status}</span>
                </div>
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between text-sm">
                <a className={`btn btn-outline btn-sm ${historyPage<=1?'pointer-events-none opacity-50':''}`} href={makeHref(historyPage-1)}>← Назад</a>
                <div className="text-muted">Страница {historyPage} из {totalPages}</div>
                <a className={`btn btn-outline btn-sm ${historyPage>=totalPages?'pointer-events-none opacity-50':''}`} href={makeHref(historyPage+1)}>Вперёд →</a>
              </div>
            )}
          </section>
        )
      })()}

      {tab === 'materials' && (
        <section className="section">
          <h2 className="mb-2 text-lg font-semibold">Материалы и ДЗ</h2>
          {/* Индикатор использования */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-sm">
              <div>Память: {limitMb > 0 ? `${Math.round(usedMb)} МБ из ${Math.round(limitMb)} МБ` : 'подписка без медиа'}</div>
              <form action={purgeStorageNow} className="ml-3">
                <input type="hidden" name="childId" value={child.id} />
                <button className="btn btn-outline btn-sm" type="submit">Очистить</button>
              </form>
            </div>
            {limitMb > 0 && (
              <div className="mt-2 h-2 rounded bg-gray-200">
                <div className="h-2 rounded bg-red-600" style={{ width: `${usedPct}%` }} />
              </div>
            )}
          </div>

          {sp?.err === 'storage_limit' && (
            <div className="mb-3 rounded border p-3 bg-rose-50 text-rose-900 text-sm">Превышен лимит хранения по подписке. Удалите старые материалы/вложения (кнопка «Очистить») и повторите загрузку.</div>
          )}
          {limitMb <= 0 && (
            <div className="mb-3 rounded border p-3 bg-amber-50 text-amber-900 text-sm">Подписка не включает раздел «Медиа». Загрузка материалов недоступна.</div>
          )}

          {limitMb > 0 && (
            <form action={uploadMaterial} className="grid gap-3 sm:grid-cols-3">
              <input type="hidden" name="childId" value={child.id} />
              <input name="name" placeholder="Название (опц.)" className="input" />
              <input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.mp4" className="input !p-1" required />
              <button className="btn btn-primary">Загрузить</button>
            </form>
          )}

          <div className="mt-4 space-y-2">
            {child.documents.length === 0 && <div className="text-sm text-muted">Материалов нет</div>}
            {child.documents.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between p-3 rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                <div>
                  <div className="font-medium">{d.name}</div>
                  <a className="underline text-sm" href={d.url} target="_blank">Открыть</a>
                </div>
                <form action={deleteMaterial}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="childId" value={child.id} />
                  <button className="btn btn-danger text-sm">Удалить</button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
