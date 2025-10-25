import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AdminBackupsPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role as string | undefined
  if (!session || role !== 'SUPER_ADMIN') {
    redirect('/')
  }
  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Эталонные бэкапы</h1>
      <p className="text-sm text-muted">Доступно только SUPER_ADMIN. Скрипт запускается внутри контейнера: /usr/local/bin/backup_logoped_etalon.sh</p>
      <form action="/api/admin/backups" method="post">
        <button className="btn btn-primary" type="submit">Создать эталонный бэкап</button>
      </form>
      <div className="text-sm text-muted">
        После запуска проверьте папку бэкапов на сервере согласно Runbook.
      </div>
    </div>
  )
}
