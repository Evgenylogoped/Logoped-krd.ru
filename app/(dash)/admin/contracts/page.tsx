import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createContract, uploadSignedPdf, updateContractStatus } from './actions'

export default async function ContractsPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(role)) return <div>Доступ запрещён</div>

  const contracts = await prisma.contract.findMany({
    orderBy: { createdAt: 'desc' },
    include: { parent: { include: { user: true } }, child: true },
  })

  return (
    <div className="container space-y-6 py-6">
      <h1 className="text-3xl font-bold">Договоры</h1>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Создать договор (DRAFT)</h2>
        <form action={createContract} className="grid gap-3 sm:grid-cols-3">
          <input name="parentEmail" placeholder="Email родителя" className="input" required />
          <input name="childId" placeholder="ID ребёнка (опционально)" className="input" />
          <button className="btn btn-primary">Создать</button>
        </form>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Список</h2>
        <div className="space-y-2">
          {contracts.length === 0 && <div className="text-sm text-muted">Договоров пока нет</div>}
          {contracts.map(c => (
            <div key={c.id} className="flex flex-col gap-2 p-3 rounded-md border shadow-sm" style={{ background: 'var(--card-bg)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {c.parent.user?.email} {c.child ? `· ${c.child.lastName} ${c.child.firstName}` : ''}
                    <span className={`badge ${c.status === 'ACTIVE' ? 'badge-green' : c.status === 'DRAFT' ? 'badge-amber' : c.status === 'SUSPENDED' ? 'badge-gray' : c.status === 'TERMINATED' ? 'badge-red' : ''}`}>{c.status}</span>
                  </div>
                  <div className="text-sm text-muted">{new Date(c.createdAt).toLocaleString('ru-RU')}</div>
                  {c.fileUrl && <a className="underline" href={c.fileUrl} target="_blank">Скачать PDF</a>}
                </div>
                <form action={updateContractStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <select name="status" defaultValue={c.status} className="input !py-1 !px-2 text-sm w-auto">
                    <option value="DRAFT">DRAFT</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                    <option value="TERMINATED">TERMINATED</option>
                  </select>
                  <button className="btn text-sm">Сохранить</button>
                </form>
              </div>
              <div>
                <form action={uploadSignedPdf} className="flex items-center gap-2">
                  <input type="hidden" name="contractId" value={c.id} />
                  <input type="file" name="file" accept="application/pdf" className="input !p-1 text-sm w-auto" />
                  <button className="btn btn-secondary text-sm">Загрузить подписанный PDF</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
