"use client"
import { signIn, useSession } from 'next-auth/react'
import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const { data } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (data?.user) {
      router.replace('/after-login')
    }
  }, [data, router])

  async function socialSignIn(provider: 'google' | 'yandex' | 'vk') {
    try {
      setOauthLoading(provider)
      const res = await signIn(provider, { callbackUrl: '/after-login' })
      return res
    } finally {
      setTimeout(()=> setOauthLoading(null), 1200)
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await signIn('credentials', { email, password, redirect: false, callbackUrl: '/after-login' })
    // next-auth returns { ok, error, status, url } when redirect:false
    if ((res as any)?.error) {
      setError('Неверный логин или пароль')
      setLoading(false)
      return
    }
    // success: navigate
    const url = (res as any)?.url || '/after-login'
    router.replace(url)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <form onSubmit={onSubmit} className="card w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Вход</h1>
        <div className="space-y-1">
          <label className="block text-sm">Email</label>
          <input className="input" value={email} onChange={e=>setEmail(e.target.value)} type="email" required />
        </div>
        <div className="space-y-1">
          <label className="block text-sm">Пароль</label>
          <input className="input" value={password} onChange={e=>setPassword(e.target.value)} type="password" required />
        </div>
        {error && <div className="text-sm text-red-600">{error}</div>}
        <button disabled={loading} className="btn btn-primary w-full disabled:opacity-50">
          {loading ? 'Входим…' : 'Войти'}
        </button>
        <div className="text-center text-sm">
          <a href="/auth/forgot-password" className="underline">Забыли пароль?</a>
        </div>

        <div className="relative my-2 text-center text-xs text-gray-500">
          <span className="px-2 bg-transparent">или</span>
        </div>
        <div className="grid grid-cols-1 gap-2">
          <button type="button" onClick={()=>socialSignIn('google')} className="btn btn-outline w-full disabled:opacity-50" disabled={!!oauthLoading}>
            {oauthLoading==='google' ? 'Google…' : 'Войти через Google'}
          </button>
          <button type="button" onClick={()=>socialSignIn('yandex')} className="btn btn-outline w-full disabled:opacity-50" disabled={!!oauthLoading}>
            {oauthLoading==='yandex' ? 'Yandex…' : 'Войти через Яндекс'}
          </button>
          <button type="button" onClick={()=>socialSignIn('vk')} className="btn btn-outline w-full disabled:opacity-50" disabled={!!oauthLoading}>
            {oauthLoading==='vk' ? 'VK…' : 'Войти через VK'}
          </button>
        </div>
      </form>
    </div>
  )
}
