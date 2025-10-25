import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const revalidate = 0

export default async function SettingsScheduleFloatingPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role as string | undefined
  if (!session?.user || !['LOGOPED','ADMIN','SUPER_ADMIN'].includes(role || '')) {
    return <div className="container py-6">Доступ запрещён</div>
  }
  return (
    <div className="container py-6 space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">Настройки расписания (FLOATING)</h1>
      <div className="rounded border p-3" style={{ background: 'var(--card-bg)' }}>
        <div className="text-sm text-muted">Черновик. Здесь будет редактор разрешённых длительностей (например, 30/50/70) и рабочих периодов по дням недели.</div>
      </div>
      <div className="text-sm">
        <Link href="/logoped/schedule-floating" className="btn btn-outline btn-xs">Открыть Расписание П</Link>
      </div>
    </div>
  )
}
