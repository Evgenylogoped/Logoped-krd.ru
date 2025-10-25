import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requestActivation } from './actions'

export const revalidate = 0

export default async function ParentHome() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || role !== 'PARENT') return <div>Доступ запрещён</div>
  const userId = (session.user as any).id as string
  const parent = await prisma.parent.findUnique({ where: { userId }, include: { user: true, activationRequests: { orderBy: { createdAt: 'desc' } }, children: true } })
  const childIds = (parent?.children ?? []).map((c: any) => c.id)
  const now = new Date()
  const to = new Date(now)
  to.setDate(now.getDate() + 14)
  const upcoming = childIds.length
    ? await prisma.enrollment.findMany({
        where: {
          childId: { in: childIds },
          status: 'ENROLLED',
          lesson: { startsAt: { gte: now }, endsAt: { lte: to } },
        },
        include: { lesson: true, child: true },
        orderBy: { lesson: { startsAt: 'asc' } },
      })
    : []
  const groups = new Map<string, any[]>()
  for (const e of upcoming) {
    const d = new Date(e.lesson.startsAt)
    d.setHours(0,0,0,0)
    const key = d.toISOString()
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4">
      <h1 className="text-2xl font-bold">Ближайшие занятия (2 недели)</h1>
      <section className="section">
        {(upcoming as any[]).length === 0 && (
          <div className="text-sm text-muted">На ближайшие 14 дней занятий нет</div>
        )}
        {Array.from(groups.entries()).map(([k, arr]) => {
          const day = new Date(k)
          return (
            <div key={k} className="mb-4">
              <div className="font-semibold text-sm text-muted mb-2">{day.toLocaleDateString('ru-RU')}</div>
              <div className="grid gap-2">
                {arr.map((e:any) => (
                  <div key={`${e.childId}:${e.lessonId}`} className="rounded border p-3 shadow-sm flex items-center justify-between" style={{ background: 'var(--card-bg)' }}>
                    <div>
                      <div className="font-medium text-sm">{e.child.lastName} {e.child.firstName}</div>
                      <div className="text-xs text-muted">
                        {new Date(e.lesson.startsAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}
                        — {new Date(e.lesson.endsAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}
                      </div>
                    </div>
                    <div className="text-xs text-muted">{e.lesson.title}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </section>

      <h2 className="text-xl font-semibold">Личный кабинет родителя</h2>
      {parent?.isArchived ? (
        <div className="rounded border p-3 bg-amber-50 text-amber-900">Ваш аккаунт в архиве. Отправьте запрос на активацию логопеду.</div>
      ) : (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800">Аккаунт активен.</div>
      )}

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Запросить активацию</h2>
        <form action={requestActivation} className="grid gap-2 sm:grid-cols-4 items-end">
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">E-mail логопеда</label>
            <input name="logopedEmail" type="email" className="input" required />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-sm mb-1">Комментарий (опц.)</label>
            <input name="note" className="input" />
          </div>
          <div className="sm:col-span-1">
            <button className="btn btn-primary">Отправить</button>
          </div>
        </form>
      </section>

      <section className="section">
        <div className="space-y-2">
          {parent?.activationRequests?.map((r: any) => (
            <div key={r.id} className="p-3 flex items-center justify-between text-sm rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
              <div>{new Date(r.createdAt).toLocaleString('ru-RU')}</div>
              <span className={`badge ${r.status==='PENDING'?'badge-amber':r.status==='APPROVED'?'badge-green':'badge-gray'}`}>{r.status}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
