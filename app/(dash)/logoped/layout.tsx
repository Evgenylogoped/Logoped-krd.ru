import React from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getUserPlan, getBetaRemainingDays } from '@/lib/subscriptions'

export default async function LogopedLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const userId = (session?.user as any)?.id as string | undefined
  const role = (session?.user as any)?.role as string | undefined

  let banner: React.ReactNode = null
  if (userId && (role === 'LOGOPED' || role === 'ADMIN' || role === 'SUPER_ADMIN')) {
    const plan = await getUserPlan(userId)
    if (plan === 'beta') {
      const left = await getBetaRemainingDays(userId)
      if (left > 0) {
        const email = (session?.user as any)?.email as string | undefined
        const wa = `https://wa.me/89889543377?text=${encodeURIComponent('Здравствуйте! Хочу оформить подписку. Мой email: ' + (email||''))}`
        banner = (
          <div className="rounded border p-3 mb-3 bg-indigo-50 text-indigo-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                Бета‑подписка активна. Осталось {left} из 15 дней. Далее аккаунт перейдёт на Free (филиалы 0, логопедов 1, чат — нет).
              </div>
              <a href={wa} target="_blank" className="btn btn-primary btn-sm">Оформить подписку</a>
            </div>
          </div>
        )
      }
    }
  }

  return (
    <div className="container space-y-3 py-3">
      {banner}
      {children}
    </div>
  )
}
