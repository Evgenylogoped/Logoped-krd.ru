export const dynamic = 'force-dynamic'

export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-screen-sm p-6 text-center">
      <h1 className="text-2xl font-bold">Вы офлайн</h1>
      <p className="mt-2 text-muted">Нет подключения к интернету. Основные страницы и иконки доступны из кэша.</p>
      <div className="mt-6 rounded-2xl border glass p-4">
        <img src="/icons/apple-touch-icon-180.png" alt="My Logoped" className="mx-auto h-16 w-16" />
        <p className="mt-3">Откройте сайт позже, когда интернет появится.</p>
        <p className="text-sm text-muted">сайт Logoped-KRD.ru</p>
      </div>
      <div className="mt-6 text-sm text-muted">
        Попробуйте: перезагрузить страницу, проверить Wi‑Fi/сотовую сеть.
      </div>
    </main>
  )
}
