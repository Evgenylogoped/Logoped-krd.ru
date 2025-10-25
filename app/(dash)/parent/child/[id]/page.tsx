import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function ParentChildPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<{ tab?: string }> }) {
  const { id } = await params
  const sp = (searchParams ? await searchParams : {}) as { tab?: string }
  const tab = sp.tab || 'progress'

  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || role !== 'PARENT') return <div>Доступ запрещён</div>
  const parentUserId = (session.user as any).id as string

  // Проверяем, что ребёнок принадлежит этому родителю
  const child = await (prisma as any).child.findFirst({
    where: { id, parent: { userId: parentUserId } },
    include: {
      documents: true,
      // безопасные поля родителя и логопеда тут не нужны
    },
  })
  if (!child) return <div className="container py-6">Ребёнок не найден</div>

  // Прогресс и Награды
  const [progressList, rewardsList] = await Promise.all([
    ((prisma as any).progressEntry?.findMany
      ? (prisma as any).progressEntry.findMany({ where: { childId: id }, orderBy: { date: 'desc' } })
      : Promise.resolve([])),
    ((prisma as any).childReward?.findMany
      ? (prisma as any).childReward.findMany({ where: { childId: id }, orderBy: { issuedAt: 'desc' } })
      : Promise.resolve([])),
  ]) as any[]

  return (
    <div className="container space-y-6 py-6">
      <h1 className="text-2xl font-semibold">О ребёнке</h1>

      <nav className="hidden sm:flex flex-wrap gap-2">
        <a href={`?tab=progress`} className={`btn btn-xs ${tab==='progress'?'btn-secondary':''}`}>Прогресс</a>
        <a href={`?tab=rewards`} className={`btn btn-xs ${tab==='rewards'?'btn-secondary':''}`}>Награды</a>
        <a href={`?tab=materials`} className={`btn btn-xs ${tab==='materials'?'btn-secondary':''}`}>Материалы и ДЗ</a>
      </nav>
      <div className="sm:hidden">
        <label className="text-xs text-muted block mb-1">Раздел</label>
        <select className="input !py-2 !px-2 w-full" defaultValue={tab} onChange={(e)=>{ location.href = `?tab=${e.target.value}` }}>
          <option value="progress">Прогресс</option>
          <option value="rewards">Награды</option>
          <option value="materials">Материалы и ДЗ</option>
        </select>
      </div>

      {tab === 'progress' && (
        <section className="section">
          <h2 className="mb-3 text-lg font-semibold">Прогресс</h2>
          <div className="mt-2 space-y-2">
            {progressList.length === 0 && <div className="text-sm text-muted">Записей прогресса нет</div>}
            {progressList.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between p-3 rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                <div>
                  <div className="font-medium">{p.score} очков</div>
                  <div className="text-sm text-muted">{new Date(p.date).toLocaleString('ru-RU')} {p.note ? `· ${p.note}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'rewards' && (
        <section className="section">
          <h2 className="mb-3 text-lg font-semibold">Награды</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
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
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'materials' && (
        <section className="section">
          <h2 className="mb-3 text-lg font-semibold">Материалы и ДЗ</h2>
          <div className="space-y-2">
            {child.documents.length === 0 && <div className="text-sm text-muted">Материалов нет</div>}
            {child.documents.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between p-3 rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                <div>
                  <div className="font-medium">{d.name}</div>
                  <a className="underline text-sm" href={d.url} target="_blank">Открыть</a>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
