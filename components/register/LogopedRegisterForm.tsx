"use client"

import { useEffect, useMemo, useState } from 'react'
import CityComboBox from '@/components/forms/CityComboBox'
import PhoneInput from '@/components/forms/PhoneInput'

export default function LogopedRegisterForm({ siteKey }: { siteKey?: string }) {
  const [mode, setMode] = useState<'register'|'link'>('register')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [hintExists, setHintExists] = useState<null|boolean>(null)
  const [checking, setChecking] = useState(false)

  async function checkEmailExists(value: string) {
    const v = (value || '').trim().toLowerCase()
    if (!v) { setHintExists(null); return }
    try {
      setChecking(true)
      const res = await fetch(`/api/users/exists?email=${encodeURIComponent(v)}`, { cache: 'no-store' })
      const data = await res.json()
      setHintExists(Boolean(data?.exists))
    } catch {
      setHintExists(null)
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    if (!email) { setHintExists(null); return }
    const t = setTimeout(() => checkEmailExists(email), 400)
    return () => clearTimeout(t)
  }, [email])

  useEffect(() => {
    if (hintExists) setMode('link')
  }, [hintExists])

  const showBanner = hintExists === true && mode === 'register'

  return (
    <div className="grid gap-4">
      {showBanner && (
        <div className="rounded border p-3 bg-yellow-50 text-yellow-900 text-sm">
          Email уже занят. Хотите привязать существующий аккаунт как логопеда?
          <div className="mt-2 flex gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={()=>setMode('link')}>Привязать</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={()=>setHintExists(null)}>Изменить email</button>
          </div>
        </div>
      )}

      {mode === 'register' ? (
        <form action={async (formData: FormData) => { (await import('@/app/register/actions')).registerLogoped(formData) }} className="grid gap-3">
          <input name="name" placeholder="Ваше имя (опц.)" className="input" value={name} onChange={(e)=>setName(e.target.value)} />
          <input name="email" type="email" placeholder="E-mail" className="input" required value={email} onChange={(e)=>setEmail(e.target.value)} />
          <input name="password" type="password" placeholder="Пароль" className="input" required />
          <label className="grid gap-1">
            <span className="text-xs text-muted">Телефон (опц.)</span>
            <PhoneInput name="phone" />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-muted">Город (выберите из списка)</span>
            <CityComboBox name="city" required />
          </label>
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
          <div className="text-xs text-muted">{checking ? 'Проверка email…' : ''}</div>
        </form>
      ) : (
        <div className="card p-4">
          <div className="text-sm mb-2">Пользователь с таким email уже существует. Привяжите его как логопеда.</div>
          <form action={async (formData: FormData) => { (await import('@/app/register/actions')).linkExistingLogoped(formData) }} className="grid gap-3">
            <input name="email" type="email" className="input" defaultValue={email} readOnly />
            <input name="name" placeholder="Имя (опц.)" className="input" defaultValue={name} />
            <label className="grid gap-1">
              <span className="text-xs text-muted">Телефон (опц.)</span>
              <PhoneInput name="phone" />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted">Город (выберите из списка)</span>
              <CityComboBox name="city" required />
            </label>
            <label className="text-xs flex items-start gap-2">
              <input type="checkbox" name="agree" required className="mt-1" />
              <span>
                Подтверждаю привязку аккаунта и принимаю условия
                <a className="underline ml-1" href="/privacy" target="_blank">Политики конфиденциальности</a>.
              </span>
            </label>
            <div className="flex gap-2">
              <button className="btn btn-primary">Привязать</button>
              <button type="button" className="btn btn-outline" onClick={()=>setMode('register')}>Назад к регистрации</button>
            </div>
          </form>
        </div>
      )}

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
