import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { submitEvaluation, createChildForLesson } from './actions'

export default async function LessonEvaluationPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<{ saved?: string; forbidden?: string }> }) {
  const { id } = await params
  const sp = (searchParams ? await searchParams : {}) as { saved?: string; forbidden?: string }
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','LOGOPED'].includes(role)) return <div>Доступ запрещён</div>

  const lesson = await (prisma as any).lesson.findUnique({
    where: { id },
    include: { enrolls: { include: { child: true } } },
  })
  if (!lesson) return <div className="container py-6">Занятие не найдено</div>

  const enrolled = (lesson.enrolls || [])
  const noChild = enrolled.length === 0
  // Активный абонемент по первому ребёнку (если есть)
  const childId = enrolled[0]?.childId
  const existingEval = childId ? await (prisma as any).lessonEvaluation.findFirst({ where: { lessonId: id, childId } }) : null
  const isLocked = Boolean(sp?.saved==='1' || lesson.settledAt || existingEval?.status==='DONE')
  const activePass = childId ? await (prisma as any).pass.findFirst({
    where: { childId, status: 'ACTIVE', remainingLessons: { gt: 0 } },
    orderBy: { createdAt: 'desc' }
  }) : null
  // Определим, является ли пользователь лидером или работает вне организации
  const me = await (prisma as any).user.findUnique({ where: { id: (session?.user as any).id }, include: { branch: true, ownedCompanies: true, managedBranches: true } })
  const isSolo = !me?.branchId
  const isLeader = Boolean((me?.managedBranches?.length || 0) > 0 || (me?.ownedCompanies?.length || 0) > 0)
  const hidePaymentChoice = isLeader || isSolo

  return (
    <div className="container space-y-6 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Оценка занятия</h1>
      </div>

      {isLocked && (
        <>
          <div className="rounded border p-3 bg-emerald-50 text-emerald-800">Оценка сохранена и зафиксирована. Повторное редактирование недоступно. Сейчас вы будете перенаправлены…</div>
          {/* Автопереход через 1 секунду на главную страницу логопеда */}
          <script dangerouslySetInnerHTML={{ __html: `setTimeout(function(){ try{ window.location.href='/logoped' }catch(e){} }, 1000);` }} />
        </>
      )}
      {sp?.forbidden === '1' && (
        <div className="rounded border p-3 bg-amber-50 text-amber-900">Недостаточно прав для управления этим занятием.</div>
      )}

      <div className="text-sm text-muted">
        {new Date(lesson.startsAt).toLocaleString('ru-RU')} — {new Date(lesson.endsAt).toLocaleString('ru-RU')}
      </div>

      {/* Если нет ребёнка (урок по брони) — сначала создать карточку ребёнка */}
      {noChild && (
        <div className="rounded border p-3 bg-amber-50">
          <div className="font-medium mb-2">Для оценки занятия нужна карточка ребёнка</div>
          <form action={createChildForLesson} className="grid gap-3 sm:grid-cols-3">
            <input type="hidden" name="lessonId" value={lesson.id} />
            <input name="parentEmail" type="email" placeholder="Email родителя" className="input" required />
            <input name="lastName" placeholder="Фамилия ребёнка" className="input" required />
            <input name="firstName" placeholder="Имя ребёнка" className="input" required />
            <div className="sm:col-span-3">
              <button className="btn btn-primary">Создать карточку ребёнка</button>
            </div>
          </form>
        </div>
      )}

      <form action={submitEvaluation} className="grid gap-3 sm:grid-cols-2 mt-4">
        <input type="hidden" name="lessonId" value={lesson.id} />
        {enrolled.length > 0 && (
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">Ребёнок</label>
            <select name="childId" defaultValue={enrolled[0]?.childId} className="input !py-2 !px-2">
              {enrolled.map((e: any) => (
                <option key={e.childId} value={e.childId}>{e.child?.lastName} {e.child?.firstName}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm mb-1">Оценка Д/З (1–5)</label>
          <input name="homeworkRating" type="number" min={1} max={5} className="input" defaultValue={existingEval?.homeworkRating ?? 5} disabled={isLocked} />
        </div>
        <div>
          <label className="block text-sm mb-1">Оценка занятия (1–5)</label>
          <input name="lessonRating" type="number" min={1} max={5} className="input" defaultValue={existingEval?.lessonRating ?? 5} disabled={isLocked} />
        </div>
        <div>
          <label className="block text-sm mb-1">Оценка поведения (1–5)</label>
          <input name="behaviorRating" type="number" min={1} max={5} className="input" defaultValue={existingEval?.behaviorRating ?? 5} disabled={isLocked} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm mb-1">Комментарий</label>
          <textarea name="comment" className="input" rows={4} placeholder="Комментарий для учёта. Можно отметить, что было на занятии." defaultValue={existingEval?.comment || ''} disabled={isLocked} />
        </div>
        <label className="flex items-center gap-2 sm:col-span-2">
          <input type="checkbox" name="showToParent" defaultChecked={existingEval?.showToParent ?? false} disabled={isLocked} />
          <span className="text-sm">Показать родителям</span>
        </label>

        {/* Оплата за занятие */}
        <div className="sm:col-span-2 rounded-md border p-3" style={{ background: 'var(--card-bg)' }}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium">Оплата за занятие</h3>
            {activePass ? (
              <div className="text-xs text-muted">Абонемент: после этого занятия останется {Math.max(0, Number(activePass.remainingLessons) - 1)} из {activePass.totalLessons}</div>
            ) : (
              <div className="text-xs text-muted">Абонемент не найден</div>
            )}
          </div>
          {hidePaymentChoice ? (
            <>
              <input type="hidden" name="paymentMethod" value="AUTO" />
              <div className="rounded border p-2 bg-amber-50 text-amber-900 text-sm">
                Проконтролируйте свой статус. Для лидеров и вне организации выбор формы оплаты не требуется: вся сумма относится к личной статистике.
              </div>
            </>
          ) : activePass ? (
            <>
              <input type="hidden" name="paymentMethod" value="AUTO" />
              <div className="rounded border p-2 bg-emerald-50 text-emerald-800 text-sm">
                Занятие оплатится по абонементу автоматически. Выбор формы оплаты недоступен.
              </div>
            </>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-2">
                <label className="flex items-center gap-2">
                  <input type="radio" name="paymentMethod" value="CASH_THERAPIST" disabled={isLocked} />
                  <span className="text-sm">Наличные логопеду</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="paymentMethod" value="CASH_LEADER" disabled={isLocked} />
                  <span className="text-sm">Наличные руководителю</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" name="paymentMethod" value="CASHLESS_LEADER" disabled={isLocked} />
                  <span className="text-sm">Безнал руководителю</span>
                </label>
              </div>
              <div className="text-xs text-muted mt-2">Если выбран абонемент — списание произойдёт автоматически, после сохранения оценки.</div>
            </>
          )}
        </div>

        {!isLocked && (
          <div className="sm:col-span-2">
            <button className="btn btn-primary" disabled={noChild}>Сохранить оценку</button>
          </div>
        )}
      </form>
    </div>
  )
}
