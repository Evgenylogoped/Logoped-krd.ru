import { requestPasswordReset } from './actions'

export default function ForgotPasswordPage() {
  return (
    <div className="container py-6 max-w-lg">
      <h1 className="text-2xl font-bold mb-4">Восстановление пароля</h1>
      <p className="text-sm text-muted mb-4">Укажите e‑mail. Если такой пользователь существует, мы отправим ссылку для восстановления пароля.</p>
      <form action={requestPasswordReset} className="grid gap-3">
        <label className="grid gap-1">
          <span className="text-sm text-muted">E‑mail</span>
          <input type="email" name="email" className="input" placeholder="you@example.com" required />
        </label>
        <div>
          <button className="btn btn-primary">Отправить ссылку</button>
        </div>
      </form>
    </div>
  )
}
