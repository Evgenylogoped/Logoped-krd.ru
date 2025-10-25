import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadDocument, deleteDocument } from './actions'

export default async function ParentDocumentsPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || role !== 'PARENT') return <div>Доступ запрещён</div>

  const userId = (session.user as any).id as string
  const parent = await prisma.parent.findUnique({ where: { userId }, include: { documents: true } })

  return (
    <div className="container space-y-6 py-6">
      <h1 className="text-3xl font-bold">Документы</h1>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Загрузить документ</h2>
        <form action={uploadDocument} className="grid gap-3 sm:grid-cols-3" encType="multipart/form-data">
          <input name="name" placeholder="Название (опционально)" className="input" />
          <input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="input !p-1" required />
          <button className="btn btn-primary">Загрузить</button>
        </form>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Список</h2>
        <div className="space-y-2">
          {(parent?.documents ?? []).length === 0 && (
            <div className="text-sm text-muted">Документов пока нет</div>
          )}
          {(parent?.documents ?? []).map(d => (
            <div key={d.id} className="flex items-center justify-between p-3 rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
              <div>
                <div className="font-medium">{d.name}</div>
                <a className="underline text-sm" href={d.url} target="_blank">Открыть</a>
              </div>
              <form action={deleteDocument}>
                <input type="hidden" name="id" value={d.id} />
                <button className="btn btn-danger text-sm">Удалить</button>
              </form>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
