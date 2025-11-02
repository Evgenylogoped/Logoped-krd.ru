import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import NextDynamic from 'next/dynamic'

const AdminBroadcast = NextDynamic(() => import('@/components/AdminBroadcast'), { ssr: false })

export const dynamic = 'force-dynamic'

export default async function AdminPushPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role
  if (!session?.user || !['ACCOUNTANT','ADMIN','SUPER_ADMIN'].includes(role)) return <div className="container py-6">Доступ запрещён</div>
  return (
    <div className="container py-6 space-y-4">
      <h1 className="text-2xl font-bold">Админ · Рассылка (Web Push)</h1>
      <AdminBroadcast />
    </div>
  )
}
