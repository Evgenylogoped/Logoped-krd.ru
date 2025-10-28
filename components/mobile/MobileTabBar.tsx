"use client"
import React from "react"
import Link from "next/link"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

export default function MobileTabBar({ role: roleProp, leaderFlag: leaderFlagProp }: { role?: string, leaderFlag?: boolean } = {}) {
  // Стабильный источник роли — пропсы от сервера; при отсутствии подстраховываемся фетчем
  const [roleState, setRoleState] = useState<string | undefined>(typeof roleProp === 'string' ? roleProp : undefined)
  useEffect(() => {
    if (!roleProp) {
      fetch('/api/auth/session')
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          const r = d?.user?.role
          if (typeof r === 'string' && !roleState) setRoleState(r)
        })
        .catch(() => {})
    }
  }, [roleProp, roleState])
  const role = (roleProp ?? roleState) as any
  const R = (role || "").toUpperCase()
  const isParent = R === "PARENT"
  const isLogoped = R === "LOGOPED"
  const [mounted, setMounted] = useState(false)
  const [leaderFlag] = useState<boolean | null>(leaderFlagProp ?? null)
  const [moreOpen, setMoreOpen] = useState(false)
  const pathname = usePathname()
  const [leaderApi, setLeaderApi] = React.useState<{ isOrgLeader: boolean; isBranchManager: boolean } | null>(null)
  React.useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        const r = await fetch('/api/me', { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json()
        if (!ignore && j && (typeof j.isOrgLeader === 'boolean' || typeof j.isBranchManager === 'boolean')) {
          setLeaderApi({ isOrgLeader: !!j.isOrgLeader, isBranchManager: !!j.isBranchManager })
        }
      } catch {}
    })()
    return () => { ignore = true }
  }, [])
  useEffect(() => setMounted(true), [])

  // без дополнительных запросов — чтобы исключить перепрыгивания UI
    if (!mounted) return null

  const showLeader = (leaderFlag === true) || (leaderFlag === null && (leaderApi?.isOrgLeader || leaderApi?.isBranchManager) && !isParent)
  const showLogoped = !showLeader && isLogoped
  const showParent = !showLeader && !showLogoped && isParent

  const wrapClass = "fixed bottom-0 inset-x-0 z-20 border-t md:hidden"
  const commonClass = "flex flex-col items-center justify-center gap-1 py-2 text-[11px] rounded-xl border text-muted hover:bg-gray-50 active:scale-[0.98] transition"
  const activeClass = "text-blue-800 font-extrabold border-blue-700 bg-blue-100 ring-2 ring-blue-300 shadow"
  function linkClass(href: string){
    const ok = pathname && (pathname===href || pathname.startsWith(href+'/'))
    return commonClass + (ok ? ' ' + activeClass : '')
  }

  function MenuPanel(){
    const sections: { title: string, items: { href: string, label: string }[] }[] = []
    if (showLeader) {
      sections.push({ title: 'Рук. финансы', items: [
        { href: '/logoped/finance', label: 'Лич. финансы' },
        { href: '/admin/finance/dashboard', label: 'Дашборд' },
        { href: '/admin/finance/children', label: 'Дети' },
        { href: '/admin/finance/payouts', label: 'Выплаты' },
        { href: '/admin/finance/passes', label: 'Абонемент' },
        { href: '/admin/finance/statistics', label: 'Статистика' },
        { href: '/admin/finance/archive', label: 'Архив' },
      ]})
      sections.push({ title: 'Настройки', items: [
        { href: '/settings/profile', label: 'Профиль' },
        { href: '/settings/password', label: 'Пароль' },
        { href: '/settings/billing', label: 'Подписка' },
        { href: '/settings/schedule/template', label: 'Шаблон недели' },
      ]})
      sections.push({ title: 'Организация', items: [
        { href: '/settings/organization', label: 'Компания и филиалы' },
        { href: '/logoped/organization/request', label: 'Заявка на организацию' },
        { href: '/logoped/organization/membership', label: 'Запрос на вступление' },
        { href: '/settings/organization/memberships', label: 'Входящие запросы' },
      ]})
    } else if (showLogoped) {
      sections.push({ title: 'Финансы', items: [
        { href: '/logoped/finance', label: 'Лич. финансы' },
        { href: '/logoped/org-finance', label: 'Лог. финансы' },
      ]})
      sections.push({ title: 'Настройки', items: [
        { href: '/settings/profile', label: 'Профиль' },
        { href: '/settings/password', label: 'Пароль' },
        { href: '/settings/billing', label: 'Подписка' },
        { href: '/settings/schedule/template', label: 'Шаблон недели' },
      ]})
      sections.push({ title: 'Организация', items: [
        { href: '/settings/organization', label: 'Компания и филиалы' },
        { href: '/logoped/organization/request', label: 'Заявка на организацию' },
        { href: '/logoped/organization/membership', label: 'Запрос на вступление' },
        { href: '/logoped/organization/memberships', label: 'Входящие запросы' },
      ]})
    } else if (showParent) {
      sections.push({ title: 'Профиль', items: [
        { href: '/settings/profile', label: 'Профиль' },
        { href: '/settings/password', label: 'Пароль' },
        { href: '/settings/children', label: 'Дети' },
      ]})
    }
    return (
      <div data-role={R} className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)}>
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-x-0 bottom-0 rounded-t-2xl shadow-2xl p-4 space-y-3" style={{ background: 'var(--card-bg)', color: 'var(--card-text)' }} onClick={e=>e.stopPropagation()}>
          <div className="text-center font-semibold text-sm">Меню</div>
          {sections.map((sec)=> (
            <div key={sec.title} className="space-y-1">
              <div className="text-xs text-muted">{sec.title}</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {sec.items.map((m)=> (
                  <Link key={m.href} href={m.href} className="btn" onClick={() => setMoreOpen(false)}>
                    {m.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
          <button className="btn w-full" onClick={() => setMoreOpen(false)}>Закрыть</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div data-role={R} className={wrapClass} style={{ background: 'color-mix(in oklab, var(--background) 95%, transparent)', backdropFilter: 'blur(8px)' }}>
        <div className={`grid grid-cols-5`}>
          {showLeader && (
            <>
              <Link href="/logoped/schedule" className={linkClass('/logoped/schedule')}>
                <span aria-hidden className="text-[18px] leading-none">📅</span>
                <span>Расписание</span>
              </Link>
              <Link href="/logoped/clients" className={linkClass('/logoped/clients')}>
                <span aria-hidden className="text-[18px] leading-none">👥</span>
                <span>Клиенты</span>
              </Link>
              <Link href="/logoped/notifications" className={linkClass('/logoped/notifications')}>
                <span aria-hidden className="text-[18px] leading-none">🔔</span>
                <span>Уведомл.</span>
              </Link>
              <Link href="/chat" className={linkClass('/chat')}>
                <span aria-hidden className="text-[18px] leading-none">💬</span>
                <span>Чат</span>
              </Link>
              <button className={commonClass} onClick={()=>setMoreOpen(true)}>
                <span aria-hidden className="text-[18px] leading-none">⋯</span>
                <span>Меню</span>
              </button>
            </>
          )}

          {showLogoped && (
            <>
              <Link href="/logoped/schedule" className={linkClass('/logoped/schedule')}>
                <span aria-hidden className="text-[18px] leading-none">📅</span>
                <span>Расписание</span>
              </Link>
              <Link href="/logoped/clients" className={linkClass('/logoped/clients')}>
                <span aria-hidden className="text-[18px] leading-none">👥</span>
                <span>Клиенты</span>
              </Link>
              <Link href="/logoped/notifications" className={linkClass('/logoped/notifications')}>
                <span aria-hidden className="text-[18px] leading-none">🔔</span>
                <span>Уведомл.</span>
              </Link>
              <Link href="/chat" className={linkClass('/chat')}>
                <span aria-hidden className="text-[18px] leading-none">💬</span>
                <span>Чат</span>
              </Link>
              <button className={commonClass} onClick={()=>setMoreOpen(true)}>
                <span aria-hidden className="text-[18px] leading-none">⋯</span>
                <span>Меню</span>
              </button>
            </>
          )}

          {showParent && (
            <>
              <Link href="/parent/lessons" className={linkClass('/parent/lessons')}>
                <span aria-hidden className="text-[18px] leading-none">📅</span>
                <span>Занятия</span>
              </Link>
              <Link href="/parent/enrollments" className={linkClass('/parent/enrollments')}>
                <span aria-hidden className="text-[18px] leading-none">📝</span>
                <span>Запись</span>
              </Link>
              <Link href="/parent/logopeds" className={linkClass('/parent/logopeds')}>
                <span aria-hidden className="text-[18px] leading-none">🧑‍⚕️</span>
                <span>Логопеды</span>
              </Link>
              <Link href="/chat" className={linkClass('/chat')}>
                <span aria-hidden className="text-[18px] leading-none">💬</span>
                <span>Чат</span>
              </Link>
              <button className={commonClass} onClick={()=>setMoreOpen(true)}>
                <span aria-hidden className="text-[18px] leading-none">⋯</span>
                <span>Меню</span>
              </button>
            </>
          )}
        </div>
      </div>
      {moreOpen && <MenuPanel />}
    </>
  )
}
