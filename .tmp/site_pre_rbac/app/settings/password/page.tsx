import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { changePassword } from './actions'

export default async function PasswordSettingsPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return <div className="container py-6">Доступ запрещён</div>
  return (
    <div className="container py-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-4">Смена пароля</h1>
      <form action={changePassword} className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-sm text-muted">Текущий пароль</span>
          <input name="current" type="password" className="input" placeholder="Текущий пароль" />
          <span className="text-xs text-muted">Если пароля ещё не было — оставьте пустым</span>
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-muted">Новый пароль</span>
          <input name="next" type="password" className="input" placeholder="Новый пароль (мин. 8)" required />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-muted">Подтверждение</span>
          <input name="confirm" type="password" className="input" placeholder="Повторите новый пароль" required />
        </label>
        <div className="pt-2">
          <button className="btn btn-primary">Сохранить</button>
        </div>
      </form>
      <div className="mt-4 text-sm">
        <a href="/auth/forgot-password" className="underline">Забыли пароль?</a>
      </div>
    </div>
  )
}
