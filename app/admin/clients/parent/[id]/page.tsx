import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadParentDocument } from '@/app/admin/clients/actions'
import Link from 'next/link'

export default async function AdminParentViewPage({ params, searchParams }: { params: Promise<{ id: string }>, searchParams?: Promise<Record<string, string | string[]>> }) {
  const { id } = await params
  const sp = (searchParams ? await searchParams : {}) as Record<string, string | string[]>
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>
  const parent = await prisma.parent.findUnique({
    where: { id },
    include: {
      user: true,
      children: { include: { logoped: true } },
      documents: true,
      contracts: true,
      payments: true,
    },
  })
  if (!parent) return <div className="container py-6">Клиент (родитель) не найден</div>

  const u = parent.user as any
  // Переписка родителя
  const convPage = Math.max(1, Number(((sp?.convPage ?? '1') as any)) || 1)
  const convTake = 20 * convPage
  const convParts = await prisma.conversationParticipant.findMany({
    where: { userId: parent.userId },
    include: { conversation: { include: { messages: { include: { author: true }, orderBy: { createdAt: 'desc' }, take: 50 } } } },
    orderBy: { joinedAt: 'desc' },
    take: convTake,
  })

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Клиент · Родитель</h1>
        <Link href="/admin/clients" className="btn">Назад</Link>
      </div>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded border p-4 space-y-2">
          <h2 className="font-semibold text-lg">Профиль пользователя</h2>
          <div><span className="text-muted">Имя:</span> {parent.user.name || '—'}</div>
          <div><span className="text-muted">Email:</span> {parent.user.email}</div>
          <div><span className="text-muted">Город:</span> {u.city || '—'}</div>
          <div><span className="text-muted">Адрес:</span> {u.address || '—'}</div>
          <div><span className="text-muted">Часовой пояс:</span> {u.timeZone || '—'}</div>
          <div><span className="text-muted">Письма:</span> {parent.user.notifyByEmail ? 'Включены' : 'Выключены'}</div>
          <div><span className="text-muted">Создан:</span> {new Date(parent.user.createdAt).toLocaleString('ru-RU')}</div>
        </div>
        <div className="rounded border p-4 space-y-2">
          <h2 className="font-semibold text-lg">Карточка родителя</h2>
          <div><span className="text-muted">ФИО:</span> {(parent as any).fullName || '—'}</div>
          <div><span className="text-muted">Телефон:</span> {(parent as any).phone || '—'}</div>
          <div><span className="text-muted">Информация:</span> {(parent as any).info || '—'}</div>
          <div><span className="text-muted">Статус:</span> {parent.isArchived ? 'Архивирован' : 'Активен'}</div>
          <div><span className="text-muted">Создан:</span> {new Date(parent.createdAt).toLocaleString('ru-RU')}</div>
        </div>
      </section>

      <section className="rounded border p-4">
        <h2 className="font-semibold text-lg mb-2">Дети</h2>
        <div className="space-y-2">
          {parent.children.length === 0 && <div className="text-sm text-muted">Нет детей</div>}
          {parent.children.map((ch:any) => (
            <div key={ch.id} className="p-3 text-sm flex flex-col gap-1 rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
              <div>
                <span className="font-medium">{ch.lastName} {ch.firstName}</span>
                <Link href={`/logoped/child/${ch.id}`} target="_blank" className="ml-2 link">Открыть карточку →</Link>
              </div>
              <div className="text-muted">Логопед: {ch.logoped ? (<>{ch.logoped.name ? `${ch.logoped.name} · ` : ''}<a className="link" href={`mailto:${ch.logoped.email}`}>{ch.logoped.email}</a></>) : '—'}</div>
              <div className="text-muted">Архив: {ch.isArchived ? 'Да' : 'Нет'}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded border p-4">
        <h2 className="font-semibold text-lg mb-2">Документы / Контракты / Платежи</h2>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="font-medium mb-1">Документы</div>
            {parent.documents.length === 0 && <div className="text-muted">Нет</div>}
            {parent.documents.map(d => (
              <div key={d.id}><a className="link" href={d.url} target="_blank" rel="noreferrer">{d.name}</a> · {new Date(d.createdAt).toLocaleDateString('ru-RU')}</div>
            ))}
            <form action={uploadParentDocument} className="mt-2 grid gap-2">
              <input type="hidden" name="parentId" value={parent.id} />
              <input name="name" className="input" placeholder="Название документа" />
              <input name="file" type="file" className="input" />
              <button className="btn btn-secondary btn-sm">Загрузить документ</button>
            </form>
          </div>
          <div>
            <div className="font-medium mb-1">Контракты</div>
            {parent.contracts.length === 0 && <div className="text-muted">Нет</div>}
            {parent.contracts.map(c => (
              <div key={c.id}>#{c.id.slice(-6)} · {c.status} · {c.signedAt ? new Date(c.signedAt).toLocaleDateString('ru-RU') : 'не подписан'}</div>
            ))}
          </div>
          <div>
            <div className="font-medium mb-1">Платежи</div>
            {parent.payments.length === 0 && <div className="text-muted">Нет</div>}
            {parent.payments.map(p => (
              <div key={p.id}>#{p.id.slice(-6)} · {String(p.amount)} · {p.status} · {new Date(p.createdAt).toLocaleDateString('ru-RU')}</div>
            ))}
            <a href={`mailto:${parent.user.email}`} className="btn btn-outline btn-sm mt-2">Отправить письмо</a>
          </div>
        </div>
      </section>

      <section className="rounded border p-4">
        <h2 className="font-semibold text-lg mb-2">Переписка (последние сообщения)</h2>
        <div className="grid md:grid-cols-2 gap-4">
          {convParts.length === 0 && <div className="text-sm text-muted">Нет переписки</div>}
          {convParts.map((cp:any) => (
            <div key={cp.conversation.id} className="rounded border p-3">
              <div className="font-medium mb-2">Диалог #{cp.conversation.id.slice(-6)}</div>
              <div className="space-y-2 max-h-64 overflow-auto">
                {cp.conversation.messages.length === 0 && <div className="text-sm text-muted">Сообщений нет</div>}
                {cp.conversation.messages.map((m:any) => (
                  <div key={m.id} className="text-sm">
                    <div className="text-muted">{new Date(m.createdAt).toLocaleString('ru-RU')} · {m.author?.name || m.author?.email}</div>
                    <div>{m.body}</div>
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <a href={`/chat/${cp.conversation.id}`} className="btn btn-outline btn-sm" target="_blank" rel="noreferrer">Открыть диалог</a>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3">
          <a href={`?convPage=${convPage+1}`} className="btn btn-sm">Показать ещё</a>
        </div>
      </section>
    </div>
  )
}
