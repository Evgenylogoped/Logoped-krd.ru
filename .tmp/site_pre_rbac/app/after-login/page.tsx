"use client"
import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function AfterLogin() {
  const { data, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return
    if (status === 'unauthenticated') {
      router.replace('/login')
      return
    }
    // мягкая проверка и авто-сброс принадлежности к организации, если истёк grace
    ;(async () => {
      try { await fetch('/api/org-grace', { cache: 'no-store' }) } catch {}
      // после проверки продолжаем обычный редирект
      const role = (data?.user as any)?.role
      switch (role) {
        case 'SUPER_ADMIN':
        case 'ADMIN':
          router.replace('/admin')
          break
        case 'ACCOUNTANT':
          router.replace('/admin/payments')
          break
        case 'LOGOPED':
          router.replace('/logoped')
          break
        case 'PARENT':
          router.replace('/parent')
          break
        default:
          router.replace('/')
      }
    })()
  }, [status, data, router])

  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted">
      Подождите, выполняем вход…
    </div>
  )
}
