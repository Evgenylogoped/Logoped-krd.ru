import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { updateNotifications } from './actions'

export default async function SettingsNotificationsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return <div className="py-6">Доступ запрещён</div>
  const userId = (session.user as any).id as string
  const user = await prisma.user.findUnique({ where: { id: userId } })
  const notifyByEmail = !!(user as any)?.notifyByEmail
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Уведомления</h1>
      <form action={updateNotifications} className="grid gap-3 max-w-xl">
        <label className="inline-flex items-center gap-2">
          <input name="notifyByEmail" type="checkbox" defaultChecked={notifyByEmail} />
          <span className="text-sm text-muted">Получать уведомления по e‑mail</span>
        </label>
        <div><button className="btn btn-primary">Сохранить</button></div>
      </form>
    </div>
  )
}
