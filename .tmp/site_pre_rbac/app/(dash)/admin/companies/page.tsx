import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createCompany, updateCompany, deleteCompany, uploadCompanyLogo } from './actions'

export default async function CompaniesPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ADMIN','SUPER_ADMIN'].includes(role)) return <div>Доступ запрещён</div>

  const companies = await prisma.company.findMany({ orderBy: { createdAt: 'desc' } })

  return (
    <div className="container space-y-6 py-6">
      <h1 className="text-3xl font-bold">Компании</h1>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Добавить компанию</h2>
        <form action={createCompany} className="grid gap-3 sm:grid-cols-3">
          <input name="name" placeholder="Название" className="input" required />
          <input name="website" placeholder="Сайт (https://...)" className="input" />
          <input name="about" placeholder="Описание" className="input" />
          <button className="btn btn-primary">Сохранить</button>
        </form>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Список</h2>
        <div className="space-y-2">
          {companies.length === 0 && <div className="text-sm text-muted">Нет компаний</div>}
          {companies.map(c => (
            <div key={c.id} className="flex flex-col gap-2 p-3 rounded-md border shadow-sm sm:flex-row sm:items-center sm:justify-between" style={{ background: 'var(--card-bg)' }}>
              <div>
                <div className="flex items-center gap-3">
                  {c.logoUrl && (<img src={c.logoUrl} alt="logo" className="h-8 w-8 rounded object-cover border" />)}
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-sm text-muted">{c.website} · {c.about}</div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <form action={updateCompany} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <input name="name" defaultValue={c.name} className="input !py-1 !px-2 text-sm w-auto" />
                  <input name="website" defaultValue={c.website ?? ''} className="input !py-1 !px-2 text-sm w-auto" />
                  <input name="about" defaultValue={c.about ?? ''} className="input !py-1 !px-2 text-sm w-auto" />
                  <button className="btn text-sm">Обновить</button>
                </form>
                <form action={uploadCompanyLogo} className="flex items-center gap-2" encType="multipart/form-data">
                  <input type="hidden" name="id" value={c.id} />
                  <input type="file" name="file" accept="image/*" className="input !p-1 text-sm w-auto" />
                  <button className="btn text-sm">Логотип</button>
                </form>
                <form action={deleteCompany}>
                  <input type="hidden" name="id" value={c.id} />
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
