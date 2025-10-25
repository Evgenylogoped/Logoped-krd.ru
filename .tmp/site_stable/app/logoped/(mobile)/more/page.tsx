import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export default async function LogopedMorePageMobile() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role as string | undefined
  const userId = (session?.user as any)?.id as string | undefined
  if (!session || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role || '')) return <div className="container py-6">Доступ запрещён</div>

  const me = userId ? await (prisma as any).user.findUnique({ where: { id: userId }, include: { branch: { include: { company: true } } } }) : null
  const inOrganization = Boolean(me?.branch?.companyId)

  return (
    <div className="container py-6 space-y-4 max-w-screen-md">
      <h1 className="text-2xl font-bold">Ещё</h1>
      <nav className="grid gap-2">
        <Link href="/logoped" className="btn">Главная</Link>
        {role === 'LOGOPED' && (
          <Link href="/logoped/finance" className="btn">Лог. финансы</Link>
        )}
        {(role === 'ADMIN' || role === 'SUPER_ADMIN') && (
          <Link href="/logoped/org-finance" className="btn">Рук. финансы</Link>
        )}
        <Link href="/settings/profile" className="btn">Настройки</Link>
      </nav>
      <div className="text-xs text-muted">Дополнительные разделы для мобильного режима.</div>
    </div>
  )
}
