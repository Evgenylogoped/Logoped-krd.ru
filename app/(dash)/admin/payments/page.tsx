import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createPayment, updatePaymentStatus, deletePayment } from './actions'

export default async function PaymentsPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) return <div>Доступ запрещён</div>

  const payments = await prisma.payment.findMany({
    orderBy: { createdAt: 'desc' },
    include: { parent: { include: { user: true } } },
  })

  // Статистика за прошлый календарный месяц
  const now = new Date()
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  prevMonthEnd.setHours(23,59,59,999)
  const lessonsPrev = await (prisma as any).lesson.findMany({
    where: { startsAt: { gte: prevMonthStart }, endsAt: { lte: prevMonthEnd } },
    include: { enrolls: true, logoped: true },
  })
  const attendedLessons = lessonsPrev.filter((l: any) => (l.enrolls?.length ?? 0) > 0)
  const totalLessons = attendedLessons.length
  const totalMinutes = attendedLessons.reduce((acc: number, l: any) => acc + Math.max(0, (new Date(l.endsAt).getTime() - new Date(l.startsAt).getTime())/60000), 0)
  // разбивка по логопедам
  const byLogoped = new Map<string, { name: string; lessons: number; minutes: number }>()
  for (const l of attendedLessons) {
    const id = l.logopedId || '—'
    const key = id
    const name = l.logoped?.name || l.logoped?.email || 'Без имени'
    const dur = Math.max(0, (new Date(l.endsAt).getTime() - new Date(l.startsAt).getTime())/60000)
    const row = byLogoped.get(key) || { name, lessons: 0, minutes: 0 }
    row.lessons += 1
    row.minutes += dur
    byLogoped.set(key, row)
  }

  return (
    <div className="container space-y-6 py-6">
      <h1 className="text-3xl font-bold">Платежи</h1>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Статистика (прошлый месяц)</h2>
        <div className="text-sm text-muted">Период: {prevMonthStart.toLocaleDateString('ru-RU')} — {prevMonthEnd.toLocaleDateString('ru-RU')}</div>
        <div className="grid gap-3 sm:grid-cols-3 mt-3">
          <div className="card p-3">
            <div className="text-xs text-muted">Занятий всего</div>
            <div className="text-2xl font-semibold">{totalLessons}</div>
          </div>
          <div className="card p-3">
            <div className="text-xs text-muted">Минут всего</div>
            <div className="text-2xl font-semibold">{Math.round(totalMinutes)}</div>
          </div>
          <div className="card p-3">
            <div className="text-xs text-muted">Логопедов</div>
            <div className="text-2xl font-semibold">{byLogoped.size}</div>
          </div>
        </div>
        <div className="mt-4">
          <div className="font-medium mb-2">Разбивка по логопедам</div>
          <div className="space-y-2">
            {Array.from(byLogoped.entries()).length === 0 && (
              <div className="text-sm text-muted">Данных нет</div>
            )}
            {Array.from(byLogoped.entries()).map(([id, row]) => (
              <div key={id} className="flex items-center justify-between p-3 text-sm rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
                <div className="font-medium">{row.name}</div>
                <div className="text-muted">{row.lessons} зан. · {Math.round(row.minutes)} мин</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Создать платёж</h2>
        <form action={createPayment} className="grid gap-3 sm:grid-cols-3">
          <input name="parentEmail" placeholder="Email родителя" className="input" required />
          <input name="amount" type="number" step="0.01" placeholder="Сумма" className="input" required />
          <button className="btn btn-primary">Создать</button>
        </form>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Список</h2>
        <div className="space-y-2">
          {payments.length === 0 && (
            <div className="text-sm text-muted">Платежей пока нет</div>
          )}
          {payments.map(p => (
            <div key={p.id} className="flex flex-col gap-2 p-3 rounded-md border shadow-sm sm:flex-row sm:items-center sm:justify-between" style={{ background: 'var(--card-bg)' }}>
              <div>
                <div className="font-medium flex items-center gap-2">
                  {p.parent.user?.email} — {Number(p.amount)} ₽
                  <span className={`badge ${p.status === 'PAID' ? 'badge-green' : p.status === 'PENDING' ? 'badge-amber' : p.status === 'FAILED' ? 'badge-red' : 'badge-gray'}`}>{p.status}</span>
                </div>
                <div className="text-sm text-muted">{new Date(p.createdAt).toLocaleString('ru-RU')}</div>
              </div>
              <div className="flex gap-2">
                <form action={updatePaymentStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={p.id} />
                  <select name="status" defaultValue={p.status} className="input !py-1 !px-2 text-sm w-auto">
                    <option value="PENDING">PENDING</option>
                    <option value="PAID">PAID</option>
                    <option value="FAILED">FAILED</option>
                    <option value="REFUNDED">REFUNDED</option>
                  </select>
                  <button className="btn text-sm">Сохранить</button>
                </form>
                <form action={deletePayment}>
                  <input type="hidden" name="id" value={p.id} />
                  <button className="btn btn-danger text-sm">Удалить</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
