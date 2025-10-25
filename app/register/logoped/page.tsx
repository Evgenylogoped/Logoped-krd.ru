import LogopedRegisterForm from '@/components/register/LogopedRegisterForm'

export default function RegisterLogopedPage() {
  const siteKey = process.env.TURNSTILE_SITEKEY
  return (
    <div className="container py-10 max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        <a href="/" className="btn btn-outline btn-sm">← На главную</a>
      </div>
      <h1 className="text-3xl font-bold mb-6">Регистрация логопеда</h1>
      <LogopedRegisterForm siteKey={siteKey} />
    </div>
  )
}
