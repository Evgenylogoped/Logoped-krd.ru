import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function AdminGuiPage() {
  const session = await getServerSession(authOptions)
  const role = (session?.user as any)?.role as string | undefined
  if (!session || role !== 'SUPER_ADMIN') {
    redirect('/')
  }
  return (
    <div className="container py-6 space-y-6">
      <h1 className="text-2xl font-bold">Системные GUI</h1>
      <p className="text-sm text-muted">Доступен только для SUPER_ADMIN. Ниже — прямые ссылки (BasicAuth) и SSH‑туннели.</p>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Portainer</h2>
        <a href="/admin/portainer/" className="btn btn-primary" target="_blank">Открыть Portainer</a>
        <pre className="bg-base-200 p-3 rounded text-sm overflow-auto">ssh -L 9000:127.0.0.1:9000 kadetik@192.168.1.211</pre>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Netdata</h2>
        <a href="/admin/netdata/" className="btn" target="_blank">Открыть Netdata</a>
        <pre className="bg-base-200 p-3 rounded text-sm overflow-auto">ssh -L 19999:127.0.0.1:19999 kadetik@192.168.1.211</pre>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Uptime Kuma</h2>
        <a href="/admin/uptime/" className="btn" target="_blank">Открыть Uptime Kuma</a>
        <pre className="bg-base-200 p-3 rounded text-sm overflow-auto">ssh -L 3001:127.0.0.1:3001 kadetik@192.168.1.211</pre>
      </div>
    </div>
  )
}
