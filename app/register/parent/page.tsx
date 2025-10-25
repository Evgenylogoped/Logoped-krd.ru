import { registerParent } from '../actions'
import CityComboBox from '@/components/forms/CityComboBox'
import PhoneInput from '@/components/forms/PhoneInput'

export default async function RegisterParentPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  const siteKey = process.env.TURNSTILE_SITEKEY
  const hasSecret = !!process.env.TURNSTILE_SECRET
  const { err } = await searchParams
  return (
    <div className="container py-10 max-w-xl">
      <div className="mb-4 flex items-center justify-between">
        <a href="/" className="btn btn-outline btn-sm">← На главную</a>
      </div>
      <h1 className="text-3xl font-bold mb-6">Регистрация родителя</h1>
      {err && (
        <div className="rounded border p-2 bg-amber-50 text-amber-800 text-sm mb-3">{err}</div>
      )}
      <form action={registerParent} className="grid gap-3">
        <input name="fullName" placeholder="ФИО (опц.)" className="input" />
        <label className="grid gap-1">
          <span className="text-xs text-muted">Город (выберите из списка)</span>
          <CityComboBox name="city" required />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted">Телефон</span>
          <PhoneInput name="phone" />
        </label>
        <input name="email" type="email" placeholder="E-mail" className="input" required />
        <input name="password" type="password" placeholder="Пароль" className="input" required />
        <label className="text-xs flex items-start gap-2">
          <input type="checkbox" name="agree" required className="mt-1" />
          <span>
            Я даю согласие на обработку персональных данных и принимаю условия
            <a className="underline ml-1" href="/privacy" target="_blank">Политики конфиденциальности</a>.
          </span>
        </label>
        {siteKey ? (
          <div className="cf-turnstile" data-sitekey={siteKey} />
        ) : (
          <div className="text-xs text-amber-700">Антибот не настроен (TURNSTILE_SITEKEY отсутствует). Продолжаем без проверки.</div>
        )}
        {!hasSecret && (
          <div className="text-xs text-amber-700">Антибот на сервере не настроен (TURNSTILE_SECRET отсутствует). Установите переменную окружения.</div>
        )}
        <button className="btn btn-primary">Зарегистрироваться</button>
      </form>
      {siteKey && (
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var s = document.createElement('script');
            s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
            s.async = true; s.defer = true; document.body.appendChild(s);
          })();
        ` }} />
      )}
    </div>
  )
}
