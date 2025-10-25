import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requestExpansion } from './actions'

export default async function ExpansionRequestPage({ searchParams }: { searchParams?: Promise<{ sent?: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const userId = (session?.user as any)?.id as string | undefined
  if (!session?.user || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>
  const me = userId ? await (prisma as any).user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } }) : null
  const company = me?.branch?.company
  if (!company) return (
    <div className="container py-6">Вы не состоите в организации.</div>
  )
  const sp = (searchParams ? await searchParams : {}) as { sent?: string }
  return (
    <div className="container py-6 max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Запрос на расширение лимитов</h1>
      <div className="rounded border p-3 bg-slate-50 text-sm">
        <div>Организация: <b>{company.name}</b></div>
        <div>Текущие лимиты: филиалы <b>{company.allowedBranches}</b>, логопеды <b>{company.allowedLogopeds}</b></div>
      </div>
      <div className="rounded border p-3 bg-amber-50 text-amber-900 text-sm">
        Лимиты нельзя превышать. Увеличение может быть платным. По вопросам тарификации и подробной информации обращайтесь к администратору сайта (супер‑администратор):
        <a className="underline ml-1" href="mailto:79889543377@yandex.ru">79889543377@yandex.ru</a>.
      </div>
      {sp?.sent === '1' && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Заявка отправлена бухгалтеру.</div>
      )}
      <form action={requestExpansion} className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-sm text-muted">Тип заявки</span>
          <select name="type" className="input !py-2 !px-2">
            <option value="BRANCHES">Увеличить лимит филиалов</option>
            <option value="LOGOPEDS">Увеличить лимит логопедов</option>
          </select>
        </label>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="grid gap-1">
            <span className="text-sm text-muted">Новый лимит филиалов (если выбран тип Филиалы)</span>
            <input name="requestedBranches" type="number" min={1} className="input" placeholder={`${company.allowedBranches}`} />
          </label>
          <label className="grid gap-1">
            <span className="text-sm text-muted">Новый лимит логопедов (если выбран тип Логопеды)</span>
            <input name="requestedLogopeds" type="number" min={1} className="input" placeholder={`${company.allowedLogopeds}`} />
          </label>
        </div>
        <div>
          <button className="btn btn-primary">Отправить заявку</button>
        </div>
      </form>
    </div>
  )
}
