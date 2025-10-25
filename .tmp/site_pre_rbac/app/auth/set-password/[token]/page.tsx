import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { setPasswordWithToken } from './actions'

export default async function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <div className="container py-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-4">Установка пароля</h1>
      <form action={setPasswordWithToken} className="grid gap-3">
        <input type="hidden" name="token" value={token} />
        <label className="grid gap-1">
          <span className="text-sm text-muted">Новый пароль</span>
          <input name="password" type="password" className="input" placeholder="Новый пароль (мин. 8)" required />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-muted">Подтверждение</span>
          <input name="confirm" type="password" className="input" placeholder="Повторите новый пароль" required />
        </label>
        <div className="pt-2">
          <button className="btn btn-primary">Установить пароль</button>
        </div>
      </form>
    </div>
  )
}
