import { resetPasswordWithToken } from './actions'

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <div className="container py-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-4">Установка нового пароля</h1>
      <form action={resetPasswordWithToken} className="grid gap-3">
        <input type="hidden" name="token" value={token} />
        <label className="grid gap-1">
          <span className="text-sm text-muted">Новый пароль</span>
          <input name="password" type="password" className="input" required minLength={8} />
        </label>
        <label className="grid gap-1">
          <span className="text-sm text-muted">Подтверждение</span>
          <input name="confirm" type="password" className="input" required minLength={8} />
        </label>
        <button className="btn btn-primary">Сохранить пароль</button>
      </form>
    </div>
  )
}
