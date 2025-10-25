import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const revalidate = 0

export default async function LogopedScheduleFloatingPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role as string | undefined
  if (!session?.user || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role || '')) {
    return <div className="container py-6">Доступ запрещён</div>
  }
  return (
    <div className="container py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Расписание П (FLOATING)</h1>
        <div className="text-sm flex items-center gap-2">
          <Link href="/logoped/schedule" className="btn btn-outline btn-xs">Расписание (FIXED)</Link>
          <Link href="/settings/schedule/floating" className="btn btn-outline btn-xs">Настройки FLOATING</Link>
        </div>
      </div>
      <div className="rounded border p-3" style={{ background: 'var(--card-bg)' }}>
        <div className="text-sm text-muted">Черновик раздела. Здесь будет неделя/месяц, фильтры и проверка доступности по периодам и длительности.</div>
      </div>
    </div>
  )
}
