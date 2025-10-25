 import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function BranchFinanceEntry() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  const userId = (session?.user as any)?.id
  if (!session || !['LOGOPED','ADMIN','SUPER_ADMIN','ACCOUNTANT'].includes(role)) {
    return <div className="container py-6">Доступ запрещён</div>
  }
  // Для админских ролей показываем кнопку/ссылку вместо авторедиректа, чтобы избежать мигалки авторизации
  const me = await (prisma as any).user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } })
  const ownerCompany = await (prisma as any).company.findFirst({ where: { ownerId: userId }, select: { id: true } })
  const isOwner = Boolean(me?.branch?.company?.ownerId === userId) || Boolean(ownerCompany)
  const isBranchManager = Boolean(me?.branch?.managerId === userId)
  const debug = false
  const DebugBox = () => debug ? (
    <pre className="text-xs text-muted border rounded p-2 overflow-auto">{JSON.stringify({ role, userId, hasBranch: !!me?.branchId, isOwner, isBranchManager, ownerCompany: !!ownerCompany }, null, 2)}</pre>
  ) : null

  // Если есть права — показываем явную кнопку для входа в фин. дашборд (без авто-редиректа)
  const canEnterFinance = (role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTANT' || isOwner || isBranchManager)

  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Финансы филиала</h1>
      <>
        {canEnterFinance && (
          <div className="rounded border p-3 bg-emerald-50 text-emerald-800 flex items-center justify-between">
            <div>У вас есть права для входа в админ‑финансы.</div>
            <Link href="/admin/finance/dashboard" className="btn btn-primary btn-sm">Открыть финансы</Link>
          </div>
        )}
        {!canEnterFinance && (
          <>
            <div className="rounded border p-3 bg-amber-50 text-amber-900">
              У вашего профиля нет прав руководителя филиала или владельца компании.
            </div>
            <div className="text-sm text-muted">Если вы руководитель, попросите владельца компании назначить вас менеджером филиала в разделе «Компания и филиалы».</div>
            <div className="flex gap-2">
              <Link href="/settings/organization" className="btn btn-sm">Открыть настройки организации</Link>
            </div>
          </>
        )}
        <DebugBox />
      </>
    </div>
  )
}
