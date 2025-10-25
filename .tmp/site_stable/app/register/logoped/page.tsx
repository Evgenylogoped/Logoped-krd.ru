import { registerLogoped } from '../actions'

export default function RegisterLogopedPage() {
  const siteKey = process.env.TURNSTILE_SITEKEY
  return (
    <div className="container py-10 max-w-xl">
      <h1 className="text-3xl font-bold mb-6">Регистрация логопеда</h1>
      <form action={registerLogoped} className="grid gap-3">
        <input name="name" placeholder="Ваше имя (опц.)" className="input" />
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
        <button className="btn btn-primary">Зарегистрироваться</button>
      </form>
      {/* Turnstile script */}
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
