import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import AdminBroadcastV2 from '@/components/admin/AdminBroadcastV2'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const revalidate = 0

export default async function AdminPushPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>
  const initialUsers = await prisma.user.findMany({ select: { id: true, name: true, email: true, phone: true }, orderBy: [{ name: 'asc' }, { email: 'asc' }], take: 50 })
  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Админ · Рассылка (Web Push)</h1>
      <div className="text-xs text-muted">build: admin-push-ui v2025-11-02-21:59 V2</div>
      <AdminBroadcastV2 initialUsers={initialUsers as any} />
    </div>
  )
}
