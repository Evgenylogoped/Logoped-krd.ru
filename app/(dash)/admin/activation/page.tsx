import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { activateMonths, activateForever, deactivate } from './actions'

export default async function AdminActivationPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>

  return (
    <div className="container py-6 space-y-6">
      <h1 className="text-3xl font-bold">Активация логопедов</h1>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Активировать на N месяцев</h2>
        <form action={activateMonths} className="grid gap-2 sm:grid-cols-4 items-end">
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">E-mail логопеда</label>
            <input name="email" type="email" className="input" required />
          </div>
          <div>
            <label className="block text-sm mb-1">Месяцев</label>
            <input name="months" type="number" min={1} defaultValue={1} className="input" />
          </div>
          <div>
            <button className="btn btn-primary">Активировать</button>
          </div>
        </form>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Активировать навсегда</h2>
        <form action={activateForever} className="grid gap-2 sm:grid-cols-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">E-mail логопеда</label>
            <input name="email" type="email" className="input" required />
          </div>
          <div>
            <button className="btn btn-secondary">Активировать навсегда</button>
          </div>
        </form>
      </section>

      <section className="section">
        <h2 className="mb-3 text-lg font-semibold">Деактивировать</h2>
        <form action={deactivate} className="grid gap-2 sm:grid-cols-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-sm mb-1">E-mail логопеда</label>
            <input name="email" type="email" className="input" required />
          </div>
          <div>
            <button className="btn btn-danger">Деактивировать</button>
          </div>
        </form>
      </section>
    </div>
  )
}
