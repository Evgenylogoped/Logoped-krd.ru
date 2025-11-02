"use client"
import React from "react"
import Link from "next/link"
import { useEffect, useState, useMemo } from "react"
import PayoutsPendingBadge from "@/components/finance/PayoutsPendingBadge"
import LogopedOrgFinanceBadge from "@/components/finance/LogopedOrgFinanceBadge"
import ChatUnreadBadge from "@/components/chat/ChatUnreadBadge"
import NotificationsBadge from "@/components/notifications/NotificationsBadge"
import SchedulePendingBadge from "@/components/schedule/SchedulePendingBadge"
import { usePathname } from "next/navigation"

export default function MobileTabBar({ role: roleProp, leaderFlag: leaderFlagProp }: { role?: string, leaderFlag?: boolean } = {}) {
  // Стабильный источник роли — пропсы от сервера; при отсутствии подстраховываемся фетчем
  const [roleState, setRoleState] = useState<string | undefined>(undefined)
  useEffect(() => {
    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && typeof d.role === 'string') setRoleState(String(d.role))
      })
      .catch(()=>{})
  }, [])
  const role = (roleState ?? roleProp) as any
  const R = (role || "").toUpperCase()
  const [mounted, setMounted] = useState(false)
  const [leaderFlag] = useState<boolean | null>(leaderFlagProp ?? null)
  const [moreOpen, setMoreOpen] = useState(false)
  const pathname = usePathname()
  const [leaderApi, setLeaderApi] = useState<{ isOrgLeader: boolean; isBranchManager: boolean } | null>(null)
  useEffect(() => {
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

  const isParent = R === "PARENT"
  const isLogoped = R === "LOGOPED"
  const isAdminLike = ['ADMIN','SUPER_ADMIN','ACCOUNTANT','SUPERVISOR','OWNER'].includes(R)

  useEffect(() => setMounted(true), [])

  // без дополнительных запросов — чтобы исключить перепрыгивания UI
    if (!mounted) return null

  const showAdmin = isAdminLike && !isParent
  const showLeader = !showAdmin && ((leaderFlag === true) || (leaderFlag === null && (leaderApi?.isOrgLeader || leaderApi?.isBranchManager) && !isParent))
  const showLogoped = !showAdmin && !showLeader && isLogoped
  const showParent = !showAdmin && !showLeader && !showLogoped && isParent

  const wrapClass = "fixed bottom-0 inset-x-0 z-20 border-t md:hidden"
  const commonClass = "flex flex-col items-center justify-center gap-1 py-2 text-[11px] rounded-xl border text-muted hover:bg-gray-50 active:scale-[0.98] transition relative"
  const activeClass = "text-blue-800 font-extrabold border-blue-700 bg-blue-100 ring-2 ring-blue-300 shadow"
  function linkClass(href: string){
    const ok = pathname && (pathname===href || pathname.startsWith(href+'/'))
    return commonClass + (ok ? ' ' + activeClass : '')
  }

  function MenuPanel(){
    const sections: { title: string, items: { href: string, label: string; key?: string }[] }[] = []
    if (showAdmin) {
      sections.push({ title: 'Админ', items: [
        { href: '/admin/organizations', label: 'Организации' },
        { href: '/admin/branches', label: 'Филиалы' },
        { href: '/admin/groups', label: 'Группы' },
        { href: '/admin/logopeds', label: 'Логопеды' },
        { href: '/admin/clients', label: 'Клиенты' },
        { href: '/admin/org-requests', label: 'Заявки' },
        { href: '/admin/users', label: 'Пользователи' },
        { href: '/admin/payments', label: 'Платежи' },
        { href: '/admin/finance', label: 'Финансы' },
        { href: '/admin/audit', label: 'Аудит' },
        { href: '/admin/search', label: 'Поиск' },
        { href: '/admin/vip', label: 'VIP' },
        { href: '/admin/subscriptions', label: 'Подписки' },
        { href: '/admin/push', label: 'Рассылка' },
        { href: '/admin/subscriptions/requests', label: '· Заявки на смену' },
        { href: '/admin/subscriptions/limit-requests', label: '· Лимит‑заявки' },
        ...(R==='SUPER_ADMIN' ? [
          { href: '/admin/backups', label: 'Бэкапы' },
          { href: '/admin/system/gui', label: 'Системное администрирование' },
        ] : []),
        { href: '/admin/tools/purge', label: 'Очистка' },
      ]})
      sections.push({ title: 'Настройки', items: [
        { href: '/settings/profile', label: 'Профиль' },
        { href: '/settings/password', label: 'Пароль' },
        { href: '/settings/billing', label: 'Подписка' },
      ]})
    } else if (showLeader) {
      sections.push({ title: 'Рук. финансы', items: [
        { href: '/logoped/finance', label: 'Лич. финансы' },
        { href: '/admin/finance/dashboard', label: 'Дашборд' },
        { href: '/admin/finance/children', label: 'Дети' },
        { href: '/admin/finance/payouts', label: 'Выплаты', key: 'payouts' },
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
        { href: '/logoped/org-finance', label: 'Лог. финансы', key: 'orgfin' },
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
                  <Link key={m.href} href={m.href} className="btn relative" onClick={() => setMoreOpen(false)}>
                    <span>{m.label}</span>
                    {showLeader && m.key==='payouts' && (
                      <span className="absolute top-1 right-2 z-10">
                        <PayoutsPendingBadge />
                      </span>
                    )}
                    {showLogoped && m.key==='orgfin' && (
                      <span className="absolute top-1 right-2 z-10">
                        <LogopedOrgFinanceBadge />
                      </span>
                    )}
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
          {showAdmin && (
            <>
              <Link href="/chat" className={linkClass('/chat')}>
                <span aria-hidden className="text-[18px] leading-none">💬</span>
                <span>Чат</span>
                <span className="absolute top-0 right-1 z-10">
                  <ChatUnreadBadge />
                </span>
              </Link>
              <Link href="/admin/users" className={linkClass('/admin/users')}>
                <span aria-hidden className="text-[18px] leading-none">👤</span>
                <span>Пользов.</span>
              </Link>
              <Link href="/admin/clients" className={linkClass('/admin/clients')}>
                <span aria-hidden className="text-[18px] leading-none">👪</span>
                <span>Клиенты</span>
              </Link>
              <Link href="/admin/logopeds" className={linkClass('/admin/logopeds')}>
                <span aria-hidden className="text-[18px] leading-none">🧑‍⚕️</span>
                <span>Логопеды</span>
              </Link>
              <button className={commonClass + ' relative'} onClick={()=>setMoreOpen(true)}>
                <span aria-hidden className="text-[18px] leading-none">⋯</span>
                <span>Меню</span>
              </button>
            </>
          )}

          {showLeader && (
            <>
              <Link href="/logoped/schedule" className={linkClass('/logoped/schedule')}>
                <span aria-hidden className="text-[18px] leading-none">📅</span>
                <span>Расписание</span>
                <span className="absolute top-0 right-1 z-10">
                  <SchedulePendingBadge />
                </span>
              </Link>
              <Link href="/logoped/clients" className={linkClass('/logoped/clients')}>
                <span aria-hidden className="text-[18px] leading-none">👥</span>
                <span>Клиенты</span>
              </Link>
              <Link href="/logoped/notifications" className={linkClass('/logoped/notifications')}>
                <span aria-hidden className="text-[18px] leading-none">🔔</span>
                <span>Уведомл.</span>
                <span className="absolute top-0 right-1 z-10">
                  <NotificationsBadge />
                </span>
              </Link>
              <Link href="/chat" className={linkClass('/chat')}>
                <span aria-hidden className="text-[18px] leading-none">💬</span>
                <span>Чат</span>
                <span className="absolute top-0 right-1 z-10">
                  <ChatUnreadBadge />
                </span>
              </Link>
              <button className={commonClass + ' relative'} onClick={()=>setMoreOpen(true)}>
                <span aria-hidden className="text-[18px] leading-none">⋯</span>
                <span>Меню</span>
                <span className="absolute top-0 right-1 z-10">
                  <PayoutsPendingBadge />
                </span>
              </button>
            </>
          )}

          {showLogoped && (
            <>
              <Link href="/logoped/schedule" className={linkClass('/logoped/schedule')}>
                <span aria-hidden className="text-[18px] leading-none">📅</span>
                <span>Расписание</span>
                <span className="absolute -top-1 right-2">
                  <SchedulePendingBadge />
                </span>
              </Link>
              <Link href="/logoped/clients" className={linkClass('/logoped/clients')}>
                <span aria-hidden className="text-[18px] leading-none">👥</span>
                <span>Клиенты</span>
              </Link>
              <Link href="/logoped/notifications" className={linkClass('/logoped/notifications')}>
                <span aria-hidden className="text-[18px] leading-none">🔔</span>
                <span>Уведомл.</span>
                <span className="absolute -top-1 right-2">
                  <NotificationsBadge />
                </span>
              </Link>
              <Link href="/chat" className={linkClass('/chat')}>
                <span aria-hidden className="text-[18px] leading-none">💬</span>
                <span>Чат</span>
                <span className="absolute -top-1 right-2">
                  <ChatUnreadBadge />
                </span>
              </Link>
              <button className={commonClass + ' relative'} onClick={()=>setMoreOpen(true)}>
                <span aria-hidden className="text-[18px] leading-none">⋯</span>
                <span>Меню</span>
                <span className="absolute top-0 right-1 z-10">
                  <LogopedOrgFinanceBadge />
                </span>
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
