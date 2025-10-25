import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { requestOrganization, cancelOrganizationRequest } from './actions'

export default async function OrganizationRequestPage({ searchParams }: { searchParams?: Promise<{ sent?: string; err?: string; cancelled?: string }> }) {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session?.user || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>
  const userId = (session.user as any).id as string
  // Текущий статус: если уже состоит в организации — считаем, что заявка одобрена
  const me = await prisma.user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } })
  const companyName = me?.branch?.company?.name as string | undefined
  // Последняя заявка
  const lastReq = await prisma.organizationRequest.findFirst({ where: { requesterId: userId }, orderBy: { createdAt: 'desc' } })
  const isPending = !companyName && lastReq?.status === 'PENDING'
  const isRejected = !companyName && lastReq?.status === 'REJECTED'
  const sp = (searchParams ? await searchParams : {}) as { sent?: string; err?: string; cancelled?: string }
  return (
    <div className="container py-6 max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Заявка на создание организации</h1>
      {companyName && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Заявка одобрена. Ваша организация: <b>{companyName}</b>. <a className="underline ml-1" href="/settings/organization">Перейти к настройкам организации →</a></div>
      )}
      {!companyName && isPending && (
        <div className="rounded border p-3 bg-indigo-50 text-indigo-900 text-sm">Ваша заявка отправлена и находится на рассмотрении. Пожалуйста, дождитесь решения бухгалтерии.</div>
      )}
      {!companyName && isRejected && (
        <div className="rounded border p-3 bg-amber-50 text-amber-900 text-sm">Заявка отклонена{lastReq?.reason ? `: ${lastReq.reason}` : '.'} Вы можете отправить новую заявку.</div>
      )}
      {sp?.cancelled === '1' && (
        <div className="rounded border p-3 bg-amber-50 text-amber-900 text-sm">Заявка отменена.</div>
      )}
      {sp?.err === 'pending' && (
        <div className="rounded border p-3 bg-indigo-50 text-indigo-900 text-sm">Заявка уже отправлена и находится на рассмотрении. Дождитесь решения прежде чем отправлять новую.</div>
      )}
      {sp?.sent === '1' && !companyName && (
        <div className="rounded border p-3 bg-emerald-50 text-emerald-800 text-sm">Заявка отправлена. Ожидайте решения бухгалтера.</div>
      )}
      <form action={requestOrganization} className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-sm text-muted">Название организации</span>
          <input name="name" className="input" required disabled={Boolean(companyName || isPending)} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-muted">Сайт (опционально)</span>
          <input name="website" className="input" disabled={Boolean(companyName || isPending)} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-muted">Описание</span>
          <textarea name="about" className="input min-h-[96px]" disabled={Boolean(companyName || isPending)} />
        </label>
        <div>
          <button className="btn btn-primary" disabled={Boolean(companyName || isPending)}>Отправить заявку</button>
        </div>
      </form>
      {!companyName && isPending && lastReq?.id && (
        <form action={cancelOrganizationRequest} className="mt-2">
          <input type="hidden" name="requestId" value={lastReq.id} />
          <button className="btn btn-outline btn-sm">Отменить заявку</button>
        </form>
      )}
    </div>
  )
}
