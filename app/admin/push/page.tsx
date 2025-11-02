import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import AdminBroadcastV2 from '@/components/admin/AdminBroadcastV2'

export const dynamic = 'force-dynamic'

export default async function AdminPushPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>
  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Админ · Рассылка (Web Push)</h1>
      <div className="text-xs text-muted">build: admin-push-ui v2025-11-02-17:07 V2</div>
      <AdminBroadcastV2 />
    </div>
  )
}
