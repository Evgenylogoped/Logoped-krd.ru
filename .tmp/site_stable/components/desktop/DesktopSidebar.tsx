"use client"
import React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import Icon from "@/components/Icon"
import ChatUnreadBadge from "@/components/chat/ChatUnreadBadge"
import NotificationsBadge from "@/components/notifications/NotificationsBadge"
import SchedulePendingBadge from "@/components/schedule/SchedulePendingBadge"

function Item({ href, icon, label, title, collapsed=false }: { href: string; icon: React.ReactNode; label: string; title?: string; collapsed?: boolean }) {
  const pathname = usePathname()
  const active = pathname === href || (href !== "/" && pathname.startsWith(href))
  return (
    <Link
      href={href}
      title={title || label}
      className={`sidebar-item ${collapsed ? 'gap-0 justify-center' : ''} ${active ? 'active' : ''}`}
      style={active ? { color: 'var(--brand)' } : undefined}
    >
      <span className="text-lg w-5 text-center">{icon}</span>
      <span className={`${collapsed ? 'sr-only' : 'truncate'}`}>{label}</span>
    </Link>
  )
}

export default function DesktopSidebar({ role: roleProp, city: cityProp }: { role?: string; city?: string }) {
  const { data } = useSession()
  const role = (roleProp as any) ?? ((data?.user as any)?.role as string | undefined)
  const [pinned, setPinned] = React.useState(false)
  const cityRaw = (cityProp ?? ((data?.user as any)?.city as string | undefined))?.trim()
  const [isLeader, setIsLeader] = React.useState<boolean>(false)
  const [inOrg, setInOrg] = React.useState<boolean>(false)

  React.useEffect(() => {
    try { setPinned(localStorage.getItem('sidebar.pinned') === '1') } catch {}
  }, [])

  // Загрузка признаков лидер/состоит в организации
  React.useEffect(() => {
    let ignore = false
    async function load() {
      try {
        if (role === 'LOGOPED') {
          const res = await fetch('/api/me/leadership', { cache: 'no-store' })
          if (!ignore && res.ok) {
            const j = await res.json()
            setIsLeader(Boolean(j?.isLeader))
            setInOrg(Boolean(j?.inOrg))
          }
        }
      } catch {}
    }
    load()
    return () => { ignore = true }
  }, [role])

  function togglePin() {
    const next = !pinned
    setPinned(next)
    try { localStorage.setItem('sidebar.pinned', next ? '1' : '0') } catch {}
  }

  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.classList.add('sidebar-present')
      document.body.classList.toggle('sidebar-pinned', pinned)
      return () => { document.body.classList.remove('sidebar-present') }
    }
  }, [pinned])

  function toPrepositionalCity(city?: string) {
    if (!city) return ''
    const c = city.trim()
    const lower = c.toLowerCase()
    if (lower.endsWith('ия')) return c.slice(0, -2) + 'ии'
    if (lower.endsWith('ие')) return c.slice(0, -2) + 'ии'
    if (lower.endsWith('а')) return c.slice(0, -1) + 'е'
    if (lower.endsWith('я')) return c.slice(0, -1) + 'е'
    if (lower.endsWith('й')) return c.slice(0, -1) + 'е'
    if (lower.endsWith('ь')) return c.slice(0, -1) + 'и'
    if (/[бвгджзйклмнпрстфхцчшщ]$/i.test(lower)) return c + 'е'
    return c
  }
  const cityPrep = toPrepositionalCity(cityRaw)

  // один aside: ширина зависит от pinned; подписи скрываются при collapsed
  return (
    <>
      <aside
        className={`hidden md:flex fixed inset-y-0 left-0 ${pinned ? 'w-[240px]' : 'w-[72px]'} border-r border-gray-200 z-30 flex-col`}
        style={{ background: 'var(--background)', color: 'var(--foreground)' }}
      > 
        <div className="relative">
          <button className="btn btn-ghost btn-sm h-9 absolute top-3 left-2" onClick={togglePin} title={pinned ? 'Свернуть меню' : 'Развернуть меню'}>≡</button>
          <div className="h-14" />
        </div>
        <div className="px-2 pb-3 overflow-auto">
          {/* Главная */}
          <div className="mb-3">
            <div className="grid gap-1">
              {(() => {
                const homeHref = role === 'LOGOPED' ? '/logoped' : ((role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTANT') ? '/admin/organizations' : (role === 'PARENT' ? '/parent' : '/'))
                return <Item href={homeHref} icon={<Icon name="home" />} label="Главная" collapsed={!pinned} />
              })()}
            </div>
          </div>
          {role === 'PARENT' && (
            <div className="mb-3">
              <div className="grid gap-1">
                <Item href="/parent/lessons" icon={<Icon name="calendar" />} label="Занятия" collapsed={!pinned} />
                <Item href="/parent/enrollments" icon={<Icon name="search" />} label="Запись/Активация" collapsed={!pinned} />
                <Item href="/parent/logopeds" icon={<Icon name="clients" />} label="Логопеды" collapsed={!pinned} />
              </div>
            </div>
          )}
          {(role === 'LOGOPED' || role === 'ADMIN' || role === 'SUPER_ADMIN') && (
            <div className="mb-3">
              <div className="grid gap-1">
                <div className="relative">
                  <Item href="/logoped/schedule" icon={<Icon name="calendar" />} label="Расписание" collapsed={!pinned} />
                  <div className="absolute top-1 right-2">
                    <SchedulePendingBadge />
                  </div>
                </div>
                <Item href="/logoped/clients" icon={<Icon name="clients" />} label="Клиенты" collapsed={!pinned} />
                {/* Личные финансы доступны всем логопедам и лидерам */}
                <Item href="/logoped/finance" icon={<Icon name="settings" />} label="Лич. финансы" collapsed={!pinned} />
                {/* Организационные финансы обычного логопеда */}
                {role === 'LOGOPED' && inOrg && !isLeader && (
                  <Item href="/logoped/org-finance" icon={<Icon name="settings" />} label="Лог. финансы" collapsed={!pinned} />
                )}
                {/* Финансы руководителя/владельца */}
                {role === 'LOGOPED' && isLeader && (
                  <Item href="/logoped/branch-finance" icon={<Icon name="settings" />} label="Рук. финансы" collapsed={!pinned} />
                )}
                <div className="relative">
                  <Item href="/logoped/notifications" icon={<Icon name="bell" />} label="Уведомления" collapsed={!pinned} />
                  <div className="absolute top-1 right-2">
                    <NotificationsBadge />
                  </div>
                </div>
              </div>
            </div>
          )}
          <div className="mb-3">
            <div className="grid gap-1">
              <div className="relative">
                <Item href="/chat" icon={<Icon name="max" />} label="Чат" collapsed={!pinned} />
                <div className="absolute top-1 right-2">
                  <ChatUnreadBadge />
                </div>
              </div>
            </div>
          </div>
          {(role === 'LOGOPED' || role === 'ADMIN' || role === 'SUPER_ADMIN') && (
            <div className="mb-3">
              <div className={`${pinned ? 'text-xs uppercase text-muted mb-2' : 'sr-only'}`}>Организация</div>
              <div className="grid gap-1">
                <Item href="/settings/organization" icon={<Icon name="settings" />} label="Компания и филиалы" collapsed={!pinned} />
                <Item href="/settings/organization/request" icon={<Icon name="plus" />} label="Заявка на организацию" collapsed={!pinned} />
                <Item href="/settings/organization/membership" icon={<Icon name="login" />} label="Запрос на вступление" collapsed={!pinned} />
                <Item href="/settings/organization/memberships" icon={<Icon name="bell" />} label="Входящие запросы" collapsed={!pinned} />
              </div>
            </div>
          )}
          <div className="mb-3">
            <div className={`${pinned ? 'text-xs uppercase text-muted mb-2' : 'sr-only'}`}>Настройки</div>
            <div className="grid gap-1">
              <Item href="/settings/profile" icon={<Icon name="user" />} label="Профиль" collapsed={!pinned} />
              <Item href="/settings/password" icon={<Icon name="lock" />} label="Пароль" collapsed={!pinned} />
              {(role === 'LOGOPED' || role === 'ADMIN' || role === 'SUPER_ADMIN') && (
                <Item href="/settings/schedule/template" icon={<Icon name="calendar" />} label="Шаблон недели" collapsed={!pinned} />
              )}
            </div>
          </div>
          {role === 'PARENT' && (
            <div className="mb-3">
              <div className={`${pinned ? 'text-xs uppercase text-muted mb-2' : 'sr-only'}`}>Семья</div>
              <div className="grid gap-1">
                <Item href="/settings/children" icon={<Icon name="clients" />} label="Дети" collapsed={!pinned} />
              </div>
            </div>
          )}
          {(role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ACCOUNTANT') && (
            <div className="mb-3">
              <div className={`${pinned ? 'text-xs uppercase text-muted mb-2' : 'sr-only'}`}>Админ</div>
              <div className="grid gap-1">
                <Item href="/admin/organizations" icon={<Icon name="settings" />} label="Организации" collapsed={!pinned} />
                <Item href="/admin/logopeds" icon={<Icon name="clients" />} label="Логопеды" collapsed={!pinned} />
                <Item href="/admin/clients" icon={<Icon name="clients" />} label="Клиенты" collapsed={!pinned} />
                <Item href="/admin/org-requests" icon={<Icon name="bell" />} label="Заявки" collapsed={!pinned} />
                <Item href="/admin/payments" icon={<Icon name="login" />} label="Платежи" collapsed={!pinned} />
                <Item href="/admin/finance" icon={<Icon name="settings" />} label="Финансы" collapsed={!pinned} />
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
