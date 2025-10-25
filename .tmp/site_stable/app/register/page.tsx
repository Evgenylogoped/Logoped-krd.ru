export default function RegisterLanding() {
  return (
    <div className="container py-10">
      <h1 className="text-2xl font-bold">Регистрация</h1>
      <p className="text-muted mt-2">Выберите тип аккаунта:</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 max-w-xl">
        <a href="/register/parent" className="btn btn-primary">Я родитель</a>
        <a href="/register/logoped" className="btn btn-outline">Я логопед</a>
      </div>
    </div>
  )
}
